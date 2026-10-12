import { randomBytes } from "node:crypto";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import * as api from "@workspace/api-zod";
import {
  db,
  campaignMetricsTable,
  campaignTimelineTable,
  campaignsTable,
  customerReviewsTable,
  expensesTable,
  notificationsTable,
  ordersTable,
  productsTable,
  promoterReviewsTable,
  promotersTable,
  trackingLinksTable,
} from "@workspace/db";
import { ensureDemoWorkspace } from "../lib/demoData";
import {
  getDashboardSummary,
  getDemandAnalytics,
  getFinancialAnalytics,
  getLocationAnalytics,
  getNotificationRows,
  insightContext,
  loadBusinessSnapshot,
} from "../lib/businessAnalytics";

const router: IRouter = Router();

type Schema<T> = {
  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: Array<{ message: string }> } };
};

function parseBody<T>(
  schema: Schema<T>,
  value: unknown,
  res: Response,
): T | undefined {
  const result = schema.safeParse(value);
  if (!result.success) {
    res.status(400).json({
      error: "Invalid request body",
      details: result.error.issues.map((issue) => issue.message),
    });
    return undefined;
  }
  return result.data;
}

function getOwnerId(req: Request, res: Response): string | undefined {
  if (!req.isAuthenticated() || !req.user?.id) {
    res.status(401).json({ error: "Sign in to access this workspace." });
    return undefined;
  }
  return req.user.id;
}

function createdAt(value: Date): string {
  return value.toISOString();
}

function dateOnly(value: Date | string): string;
function dateOnly(value: Date | string | undefined): string | undefined;
function dateOnly(value: Date | string | null | undefined): string | null | undefined;
function dateOnly(
  value: Date | string | null | undefined,
): string | null | undefined {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

function productResponse(row: typeof productsTable.$inferSelect) {
  return api.CreateProductResponse.parse({
    ...row,
    createdAt: createdAt(row.createdAt),
    updatedAt: createdAt(row.updatedAt),
  });
}

function promoterResponse(row: typeof promotersTable.$inferSelect) {
  return api.CreatePromoterResponse.parse({
    ...row,
    createdAt: createdAt(row.createdAt),
  });
}

function campaignResponse(row: typeof campaignsTable.$inferSelect) {
  return api.CreateCampaignResponse.parse({
    ...row,
    createdAt: createdAt(row.createdAt),
    updatedAt: createdAt(row.updatedAt),
  });
}

function timelineResponse(row: typeof campaignTimelineTable.$inferSelect) {
  return api.CreateCampaignTimelineEntryResponse.parse({
    ...row,
    occurredAt: createdAt(row.occurredAt),
  });
}

function metricResponse(row: typeof campaignMetricsTable.$inferSelect) {
  return api.CreateCampaignMetricResponse.parse({
    ...row,
    updatedAt: createdAt(row.updatedAt),
  });
}

function orderResponse(row: typeof ordersTable.$inferSelect) {
  return api.CreateOrderResponse.parse({
    ...row,
    totalAmount: Math.max(0, row.quantity * row.unitPrice - row.discount),
    deliveryStatus: row.status,
    createdAt: createdAt(row.createdAt),
  });
}

function reviewResponse(row: typeof customerReviewsTable.$inferSelect) {
  return api.CreateCustomerReviewResponse.parse(row);
}

function expenseResponse(row: typeof expensesTable.$inferSelect) {
  return api.CreateExpenseResponse.parse({
    ...row,
    createdAt: createdAt(row.createdAt),
  });
}

async function ownsProduct(ownerId: string, productId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(and(eq(productsTable.ownerId, ownerId), eq(productsTable.id, productId)))
    .limit(1);
  return !!row;
}

async function ownsPromoter(ownerId: string, promoterId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: promotersTable.id })
    .from(promotersTable)
    .where(
      and(
        eq(promotersTable.ownerId, ownerId),
        eq(promotersTable.id, promoterId),
      ),
    )
    .limit(1);
  return !!row;
}

async function ownsCampaign(ownerId: string, campaignId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: campaignsTable.id })
    .from(campaignsTable)
    .where(
      and(
        eq(campaignsTable.ownerId, ownerId),
        eq(campaignsTable.id, campaignId),
      ),
    )
    .limit(1);
  return !!row;
}

function badReference(res: Response, label: string): void {
  res.status(400).json({ error: `The selected ${label} was not found in this workspace.` });
}

router.get("/tracking-links/:code/visit", async (req, res) => {
  const code = req.params.code;
  const [link] = await db
    .select()
    .from(trackingLinksTable)
    .where(eq(trackingLinksTable.code, code))
    .limit(1);
  if (!link) {
    res.status(404).send("Tracking link not found.");
    return;
  }
  await db
    .update(trackingLinksTable)
    .set({ clicks: sql`${trackingLinksTable.clicks} + 1` })
    .where(eq(trackingLinksTable.id, link.id));
  res.redirect(302, link.destinationUrl);
});

router.use(async (req, res, next) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  try {
    await ensureDemoWorkspace(ownerId);
    next();
  } catch (error) {
    req.log.error({ err: error }, "Unable to initialize workspace records");
    res.status(500).json({ error: "Workspace records could not be loaded." });
  }
});

router.get("/products", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const rows = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.ownerId, ownerId))
    .orderBy(desc(productsTable.updatedAt));
  res.json(api.ListProductsResponse.parse(rows.map(productResponse)));
});

router.post("/products", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const input = parseBody(api.CreateProductBody, req.body, res);
  if (!input) return;
  const [row] = await db
    .insert(productsTable)
    .values({
      ...input,
      launchDate: dateOnly(input.launchDate),
      ownerId,
      isSample: false,
    })
    .returning();
  res.status(201).json(productResponse(row));
});

router.patch("/products/:id", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const id = Number(req.params.id);
  const input = parseBody(api.UpdateProductBody, req.body, res);
  if (!input) return;
  const [row] = await db
    .update(productsTable)
    .set({
      ...input,
      launchDate: dateOnly(input.launchDate),
      updatedAt: new Date(),
    })
    .where(and(eq(productsTable.ownerId, ownerId), eq(productsTable.id, id)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Product not found." });
    return;
  }
  res.json(productResponse(row));
});

router.delete("/products/:id", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const id = Number(req.params.id);
  const [related] = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(and(eq(ordersTable.ownerId, ownerId), eq(ordersTable.productId, id)))
    .limit(1);
  const [campaign] = await db
    .select({ id: campaignsTable.id })
    .from(campaignsTable)
    .where(and(eq(campaignsTable.ownerId, ownerId), eq(campaignsTable.productId, id)))
    .limit(1);
  const [review] = await db
    .select({ id: customerReviewsTable.id })
    .from(customerReviewsTable)
    .where(
      and(
        eq(customerReviewsTable.ownerId, ownerId),
        eq(customerReviewsTable.productId, id),
      ),
    )
    .limit(1);
  const [expense] = await db
    .select({ id: expensesTable.id })
    .from(expensesTable)
    .where(and(eq(expensesTable.ownerId, ownerId), eq(expensesTable.productId, id)))
    .limit(1);
  if (related || campaign || review || expense) {
    res.status(409).json({
      error: "This product has recorded history. Archive it by setting stock to 0 instead of deleting it.",
    });
    return;
  }
  const removed = await db
    .delete(productsTable)
    .where(and(eq(productsTable.ownerId, ownerId), eq(productsTable.id, id)))
    .returning({ id: productsTable.id });
  if (!removed.length) {
    res.status(404).json({ error: "Product not found." });
    return;
  }
  res.status(204).end();
});

router.get("/promoters", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const rows = await db
    .select()
    .from(promotersTable)
    .where(eq(promotersTable.ownerId, ownerId))
    .orderBy(desc(promotersTable.createdAt));
  res.json(api.ListPromotersResponse.parse(rows.map(promoterResponse)));
});

router.post("/promoters", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const input = parseBody(api.CreatePromoterBody, req.body, res);
  if (!input) return;
  const [row] = await db
    .insert(promotersTable)
    .values({ ...input, ownerId, isSample: false })
    .returning();
  res.status(201).json(promoterResponse(row));
});

router.patch("/promoters/:id", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const id = Number(req.params.id);
  const input = parseBody(api.UpdatePromoterBody, req.body, res);
  if (!input) return;
  const [row] = await db
    .update(promotersTable)
    .set(input)
    .where(and(eq(promotersTable.ownerId, ownerId), eq(promotersTable.id, id)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Promoter not found." });
    return;
  }
  res.json(promoterResponse(row));
});

router.delete("/promoters/:id", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const id = Number(req.params.id);
  const [campaign] = await db
    .select({ id: campaignsTable.id })
    .from(campaignsTable)
    .where(and(eq(campaignsTable.ownerId, ownerId), eq(campaignsTable.promoterId, id)))
    .limit(1);
  const [order] = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(and(eq(ordersTable.ownerId, ownerId), eq(ordersTable.promoterId, id)))
    .limit(1);
  const [review] = await db
    .select({ id: promoterReviewsTable.id })
    .from(promoterReviewsTable)
    .where(
      and(
        eq(promoterReviewsTable.ownerId, ownerId),
        eq(promoterReviewsTable.promoterId, id),
      ),
    )
    .limit(1);
  const [link] = await db
    .select({ id: trackingLinksTable.id })
    .from(trackingLinksTable)
    .where(and(eq(trackingLinksTable.ownerId, ownerId), eq(trackingLinksTable.promoterId, id)))
    .limit(1);
  if (campaign || order || review || link) {
    res.status(409).json({
      error: "This promoter has recorded history and cannot be deleted. Clear their shortlist to remove them from future discovery.",
    });
    return;
  }
  const removed = await db
    .delete(promotersTable)
    .where(and(eq(promotersTable.ownerId, ownerId), eq(promotersTable.id, id)))
    .returning({ id: promotersTable.id });
  if (!removed.length) {
    res.status(404).json({ error: "Promoter not found." });
    return;
  }
  res.status(204).end();
});

router.get("/discovery", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const parsed = api.FindPromoterMatchesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a valid product for promoter matching." });
    return;
  }
  if (!(await ownsProduct(ownerId, parsed.data.productId))) {
    badReference(res, "product");
    return;
  }
  const [product] = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.ownerId, ownerId), eq(productsTable.id, parsed.data.productId)))
    .limit(1);
  const promoters = await db
    .select()
    .from(promotersTable)
    .where(eq(promotersTable.ownerId, ownerId));
  const matches = promoters.map((promoter) => {
    const audience = `${promoter.contentCategory} ${promoter.audienceInterests.join(" ")}`.toLowerCase();
    const target = `${product.category} ${product.targetAudience} ${product.description}`.toLowerCase();
    const interests = product.targetLocations.filter((location) =>
      promoter.audienceLocations.some((candidate) =>
        candidate.toLowerCase().includes(location.toLowerCase()),
      ),
    );
    const categoryMatch =
      audience.includes(product.category.toLowerCase()) ||
      product.category.toLowerCase().includes(promoter.contentCategory.toLowerCase());
    const interestMatch = promoter.audienceInterests.some((item) =>
      target.includes(item.toLowerCase()),
    );
    const locationMatch = interests.length > 0;
    const budgetMatch =
      promoter.quoteAmount <= product.promotionBudget &&
      promoter.quoteAmount <= Math.max(product.promotionBudget, 1);
    const matchScore = Math.round(
      Math.min(
        100,
        (categoryMatch ? 35 : 10) +
          (interestMatch ? 25 : 8) +
          (locationMatch ? 20 : 8) +
          (budgetMatch ? 15 : 5) +
          (promoter.engagementRate
            ? Math.min(5, promoter.engagementRate)
            : 0),
      ),
    );
    const reasons = [
      categoryMatch ? "Content category overlaps with the product." : "Content category is a partial match.",
      interestMatch ? "Listed audience interests overlap with the product brief." : "Audience-interest overlap is limited.",
      locationMatch ? `Audience locations include ${interests.join(", ")}.` : "No matching audience location is recorded.",
      budgetMatch ? "Recorded quote is within the product's promotion budget." : "Recorded quote exceeds the promotion budget.",
    ];
    const missingInformation = [
      promoter.verificationStatus === "sample" || promoter.verificationStatus === "unverified"
        ? "Profile and audience data are not independently verified."
        : null,
      promoter.averageViews === null ? "Average views are not recorded." : null,
      promoter.rating === null ? "No review rating is recorded." : null,
    ].filter((item): item is string => item !== null);
    return {
      promoter: promoterResponse(promoter),
      matchScore,
      reasons,
      missingInformation,
      estimatedReach: promoter.averageViews,
    };
  });
  matches.sort((a, b) => b.matchScore - a.matchScore);
  res.json(api.FindPromoterMatchesResponse.parse(matches));
});

router.get("/promoter-reviews", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const rows = await db
    .select()
    .from(promoterReviewsTable)
    .where(eq(promoterReviewsTable.ownerId, ownerId))
    .orderBy(desc(promoterReviewsTable.createdAt));
  res.json(
    api.ListPromoterReviewsResponse.parse(
      rows.map((row) => ({
        ...row,
        createdAt: createdAt(row.createdAt),
      })),
    ),
  );
});

router.post("/promoter-reviews", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const input = parseBody(api.CreatePromoterReviewBody, req.body, res);
  if (!input) return;
  if (!(await ownsPromoter(ownerId, input.promoterId))) {
    badReference(res, "promoter");
    return;
  }
  const [row] = await db
    .insert(promoterReviewsTable)
    .values({ ...input, ownerId, isSample: false })
    .returning();
  const allReviews = await db
    .select()
    .from(promoterReviewsTable)
    .where(
      and(
        eq(promoterReviewsTable.ownerId, ownerId),
        eq(promoterReviewsTable.promoterId, input.promoterId),
      ),
    );
  await db
    .update(promotersTable)
    .set({
      rating:
        allReviews.reduce((total, review) => total + review.rating, 0) /
        allReviews.length,
    })
    .where(
      and(
        eq(promotersTable.ownerId, ownerId),
        eq(promotersTable.id, input.promoterId),
      ),
    );
  res.status(201).json(
    api.CreatePromoterReviewResponse.parse({
      ...row,
      createdAt: createdAt(row.createdAt),
    }),
  );
});

router.get("/campaigns", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const rows = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.ownerId, ownerId))
    .orderBy(desc(campaignsTable.updatedAt));
  res.json(api.ListCampaignsResponse.parse(rows.map(campaignResponse)));
});

router.post("/campaigns", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const input = parseBody(api.CreateCampaignBody, req.body, res);
  if (!input) return;
  if (
    !(await ownsProduct(ownerId, input.productId)) ||
    !(await ownsPromoter(ownerId, input.promoterId))
  ) {
    badReference(res, "product or promoter");
    return;
  }
  const [campaign] = await db
    .insert(campaignsTable)
    .values({
      ...input,
      startDate: dateOnly(input.startDate),
      submissionDeadline: dateOnly(input.submissionDeadline),
      publicationDeadline: dateOnly(input.publicationDeadline),
      ownerId,
      status: "draft",
      agreementConfirmed: false,
      currentStage: "brief",
      isSample: false,
    })
    .returning();
  await db.insert(campaignTimelineTable).values({
    ownerId,
    campaignId: campaign.id,
    stage: "brief",
    status: "pending",
    note: "Campaign draft created.",
    isSample: false,
  });
  res.status(201).json(campaignResponse(campaign));
});

router.patch("/campaigns/:id", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const id = Number(req.params.id);
  const input = parseBody(api.UpdateCampaignBody, req.body, res);
  if (!input) return;
  if (input.productId && !(await ownsProduct(ownerId, input.productId))) {
    badReference(res, "product");
    return;
  }
  if (input.promoterId && !(await ownsPromoter(ownerId, input.promoterId))) {
    badReference(res, "promoter");
    return;
  }
  const [row] = await db
    .update(campaignsTable)
    .set({
      ...input,
      startDate: dateOnly(input.startDate),
      submissionDeadline: dateOnly(input.submissionDeadline),
      publicationDeadline: dateOnly(input.publicationDeadline),
      updatedAt: new Date(),
    })
    .where(and(eq(campaignsTable.ownerId, ownerId), eq(campaignsTable.id, id)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Campaign not found." });
    return;
  }
  res.json(campaignResponse(row));
});

router.delete("/campaigns/:id", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const id = Number(req.params.id);
  const [campaign] = await db
    .select({ id: campaignsTable.id })
    .from(campaignsTable)
    .where(and(eq(campaignsTable.ownerId, ownerId), eq(campaignsTable.id, id)))
    .limit(1);
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found." });
    return;
  }
  await db.transaction(async (tx) => {
    await tx
      .update(ordersTable)
      .set({ campaignId: null })
      .where(and(eq(ordersTable.ownerId, ownerId), eq(ordersTable.campaignId, id)));
    await tx
      .update(expensesTable)
      .set({ campaignId: null })
      .where(and(eq(expensesTable.ownerId, ownerId), eq(expensesTable.campaignId, id)));
    await tx
      .delete(campaignTimelineTable)
      .where(and(eq(campaignTimelineTable.ownerId, ownerId), eq(campaignTimelineTable.campaignId, id)));
    await tx
      .delete(campaignMetricsTable)
      .where(and(eq(campaignMetricsTable.ownerId, ownerId), eq(campaignMetricsTable.campaignId, id)));
    await tx
      .delete(trackingLinksTable)
      .where(and(eq(trackingLinksTable.ownerId, ownerId), eq(trackingLinksTable.campaignId, id)));
    await tx
      .delete(campaignsTable)
      .where(and(eq(campaignsTable.ownerId, ownerId), eq(campaignsTable.id, id)));
  });
  res.status(204).end();
});

router.post("/campaigns/:id/confirm", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const id = Number(req.params.id);
  const input = parseBody(api.ConfirmCampaignAgreementBody, req.body, res);
  if (!input) return;
  const [row] = await db
    .update(campaignsTable)
    .set({
      agreedPrice: input.agreedPrice,
      agreementConfirmed: true,
      status: "accepted",
      currentStage: "agreement-confirmed",
      updatedAt: new Date(),
    })
    .where(and(eq(campaignsTable.ownerId, ownerId), eq(campaignsTable.id, id)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Campaign not found." });
    return;
  }
  await db.insert(campaignTimelineTable).values({
    ownerId,
    campaignId: id,
    stage: "agreement",
    status: "approved",
    note: input.note ?? "Owner recorded agreement confirmation.",
    approvalDetails: "Confirmation recorded by the workspace owner; this is not an electronic signature.",
    isSample: row.isSample,
  });
  res.json(api.ConfirmCampaignAgreementResponse.parse(campaignResponse(row)));
});

router.get("/campaigns/:id/timeline", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const id = Number(req.params.id);
  if (!(await ownsCampaign(ownerId, id))) {
    res.status(404).json({ error: "Campaign not found." });
    return;
  }
  const rows = await db
    .select()
    .from(campaignTimelineTable)
    .where(
      and(
        eq(campaignTimelineTable.ownerId, ownerId),
        eq(campaignTimelineTable.campaignId, id),
      ),
    )
    .orderBy(desc(campaignTimelineTable.occurredAt));
  res.json(api.ListCampaignTimelineResponse.parse(rows.map(timelineResponse)));
});

router.post("/campaigns/:id/timeline", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const id = Number(req.params.id);
  const input = parseBody(api.CreateCampaignTimelineEntryBody, req.body, res);
  if (!input) return;
  if (!(await ownsCampaign(ownerId, id))) {
    res.status(404).json({ error: "Campaign not found." });
    return;
  }
  const [row] = await db
    .insert(campaignTimelineTable)
    .values({
      ...input,
      ownerId,
      campaignId: id,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      deadline: dateOnly(input.deadline),
      isSample: false,
    })
    .returning();
  await db
    .update(campaignsTable)
    .set({ currentStage: input.stage, updatedAt: new Date() })
    .where(and(eq(campaignsTable.ownerId, ownerId), eq(campaignsTable.id, id)));
  res.status(201).json(api.CreateCampaignTimelineEntryResponse.parse(timelineResponse(row)));
});

router.get("/campaign-metrics", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const parsed = api.ListCampaignMetricsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid campaign metrics filter." });
    return;
  }
  const conditions = [eq(campaignMetricsTable.ownerId, ownerId)];
  if (parsed.data.campaignId) {
    conditions.push(eq(campaignMetricsTable.campaignId, parsed.data.campaignId));
  }
  const rows = await db
    .select()
    .from(campaignMetricsTable)
    .where(and(...conditions))
    .orderBy(desc(campaignMetricsTable.metricDate));
  res.json(api.ListCampaignMetricsResponse.parse(rows.map(metricResponse)));
});

router.post("/campaign-metrics", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const input = parseBody(api.CreateCampaignMetricBody, req.body, res);
  if (!input) return;
  if (!(await ownsCampaign(ownerId, input.campaignId))) {
    badReference(res, "campaign");
    return;
  }
  const [row] = await db
    .insert(campaignMetricsTable)
    .values({
      ...input,
      metricDate: dateOnly(input.metricDate)!,
      ownerId,
      isSample: false,
    })
    .returning();
  res.status(201).json(api.CreateCampaignMetricResponse.parse(metricResponse(row)));
});

router.get("/tracking-links", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const rows = await db
    .select()
    .from(trackingLinksTable)
    .where(eq(trackingLinksTable.ownerId, ownerId))
    .orderBy(desc(trackingLinksTable.createdAt));
  res.json(
    api.ListTrackingLinksResponse.parse(
      rows.map((row) => ({
        ...row,
        createdAt: createdAt(row.createdAt),
      })),
    ),
  );
});

router.post("/tracking-links", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const input = parseBody(api.CreateTrackingLinkBody, req.body, res);
  if (!input) return;
  if (
    !(await ownsCampaign(ownerId, input.campaignId)) ||
    !(await ownsPromoter(ownerId, input.promoterId))
  ) {
    badReference(res, "campaign or promoter");
    return;
  }
  let destination: URL;
  try {
    destination = new URL(input.destinationUrl);
  } catch {
    res.status(400).json({ error: "Destination must be an absolute http(s) URL." });
    return;
  }
  if (!["https:", "http:"].includes(destination.protocol)) {
    res.status(400).json({ error: "Destination must use http or https." });
    return;
  }
  const code = randomBytes(9).toString("base64url");
  const [row] = await db
    .insert(trackingLinksTable)
    .values({
      ...input,
      destinationUrl: destination.href,
      ownerId,
      code,
      clicks: 0,
      isSample: false,
    })
    .returning();
  res.status(201).json(
    api.CreateTrackingLinkResponse.parse({
      ...row,
      createdAt: createdAt(row.createdAt),
    }),
  );
});

router.get("/orders", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const rows = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.ownerId, ownerId))
    .orderBy(desc(ordersTable.orderDate), desc(ordersTable.createdAt));
  res.json(api.ListOrdersResponse.parse(rows.map(orderResponse)));
});

router.post("/orders", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const input = parseBody(api.CreateOrderBody, req.body, res);
  if (!input) return;
  if (!(await ownsProduct(ownerId, input.productId))) {
    badReference(res, "product");
    return;
  }
  if (input.campaignId && !(await ownsCampaign(ownerId, input.campaignId))) {
    badReference(res, "campaign");
    return;
  }
  if (input.promoterId && !(await ownsPromoter(ownerId, input.promoterId))) {
    badReference(res, "promoter");
    return;
  }
  const [row] = await db
    .insert(ordersTable)
    .values({
      ...input,
      orderDate: dateOnly(input.orderDate)!,
      dispatchDate: dateOnly(input.dispatchDate),
      deliveryDate: dateOnly(input.deliveryDate),
      ownerId,
      isSample: false,
    })
    .onConflictDoNothing({
      target: [ordersTable.ownerId, ordersTable.orderCode],
    })
    .returning();
  if (!row) {
    res.status(409).json({ error: "An order with that code already exists." });
    return;
  }
  res.status(201).json(api.CreateOrderResponse.parse(orderResponse(row)));
});

router.patch("/orders/:id", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const id = Number(req.params.id);
  const input = parseBody(api.UpdateOrderBody, req.body, res);
  if (!input) return;
  if (input.productId && !(await ownsProduct(ownerId, input.productId))) {
    badReference(res, "product");
    return;
  }
  if (input.campaignId && !(await ownsCampaign(ownerId, input.campaignId))) {
    badReference(res, "campaign");
    return;
  }
  if (input.promoterId && !(await ownsPromoter(ownerId, input.promoterId))) {
    badReference(res, "promoter");
    return;
  }
  if (input.orderCode) {
    const [duplicate] = await db
      .select({ id: ordersTable.id })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.ownerId, ownerId),
          eq(ordersTable.orderCode, input.orderCode),
          ne(ordersTable.id, id),
        ),
      )
      .limit(1);
    if (duplicate) {
      res.status(409).json({ error: "An order with that code already exists." });
      return;
    }
  }
  const [row] = await db
    .update(ordersTable)
    .set({
      ...input,
      orderDate: input.orderDate ? dateOnly(input.orderDate) : undefined,
      dispatchDate: dateOnly(input.dispatchDate),
      deliveryDate: dateOnly(input.deliveryDate),
    })
    .where(and(eq(ordersTable.ownerId, ownerId), eq(ordersTable.id, id)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Order not found." });
    return;
  }
  res.json(api.UpdateOrderResponse.parse(orderResponse(row)));
});

router.delete("/orders/:id", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const id = Number(req.params.id);
  const removed = await db
    .delete(ordersTable)
    .where(and(eq(ordersTable.ownerId, ownerId), eq(ordersTable.id, id)))
    .returning({ id: ordersTable.id });
  if (!removed.length) {
    res.status(404).json({ error: "Order not found." });
    return;
  }
  res.status(204).end();
});

router.post("/orders/import", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const input = parseBody(api.ImportOrdersBody, req.body, res);
  if (!input) return;
  let imported = 0;
  const errors: string[] = [];
  for (const [index, row] of input.rows.entries()) {
    if (!(await ownsProduct(ownerId, row.productId))) {
      errors.push(`Row ${index + 1}: product is not in this workspace.`);
      continue;
    }
    if (row.campaignId && !(await ownsCampaign(ownerId, row.campaignId))) {
      errors.push(`Row ${index + 1}: campaign is not in this workspace.`);
      continue;
    }
    const [created] = await db
      .insert(ordersTable)
      .values({
        ...row,
        orderDate: dateOnly(row.orderDate)!,
        dispatchDate: dateOnly(row.dispatchDate),
        deliveryDate: dateOnly(row.deliveryDate),
        ownerId,
        isSample: false,
      })
      .onConflictDoNothing({
        target: [ordersTable.ownerId, ordersTable.orderCode],
      })
      .returning({ id: ordersTable.id });
    if (created) imported += 1;
    else errors.push(`Row ${index + 1}: duplicate order code was skipped.`);
  }
  res.json(
    api.ImportOrdersResponse.parse({
      imported,
      failed: errors.length,
      errors,
    }),
  );
});

router.get("/customer-reviews", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const rows = await db
    .select()
    .from(customerReviewsTable)
    .where(eq(customerReviewsTable.ownerId, ownerId))
    .orderBy(desc(customerReviewsTable.reviewDate));
  res.json(api.ListCustomerReviewsResponse.parse(rows.map(reviewResponse)));
});

router.post("/customer-reviews", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const input = parseBody(api.CreateCustomerReviewBody, req.body, res);
  if (!input) return;
  if (
    !(await ownsProduct(ownerId, input.productId)) ||
    !(await ownsOrder(ownerId, input.orderId, input.productId))
  ) {
    badReference(res, "order or product");
    return;
  }
  const [row] = await db
    .insert(customerReviewsTable)
    .values({
      ...input,
      reviewDate: dateOnly(input.reviewDate)!,
      ownerId,
      isSample: false,
    })
    .returning();
  res.status(201).json(api.CreateCustomerReviewResponse.parse(reviewResponse(row)));
});

async function ownsOrder(
  ownerId: string,
  orderId: number,
  productId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.ownerId, ownerId),
        eq(ordersTable.id, orderId),
        eq(ordersTable.productId, productId),
        eq(ordersTable.status, "delivered"),
      ),
    )
    .limit(1);
  return !!row;
}

router.get("/expenses", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const rows = await db
    .select()
    .from(expensesTable)
    .where(eq(expensesTable.ownerId, ownerId))
    .orderBy(desc(expensesTable.expenseDate));
  res.json(api.ListExpensesResponse.parse(rows.map(expenseResponse)));
});

router.post("/expenses", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const input = parseBody(api.CreateExpenseBody, req.body, res);
  if (!input) return;
  if (input.productId && !(await ownsProduct(ownerId, input.productId))) {
    badReference(res, "product");
    return;
  }
  if (input.campaignId && !(await ownsCampaign(ownerId, input.campaignId))) {
    badReference(res, "campaign");
    return;
  }
  const [row] = await db
    .insert(expensesTable)
    .values({
      ...input,
      expenseDate: dateOnly(input.expenseDate)!,
      ownerId,
      isSample: false,
    })
    .returning();
  res.status(201).json(api.CreateExpenseResponse.parse(expenseResponse(row)));
});

router.patch("/expenses/:id", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const id = Number(req.params.id);
  const input = parseBody(api.UpdateExpenseBody, req.body, res);
  if (!input) return;
  if (input.productId && !(await ownsProduct(ownerId, input.productId))) {
    badReference(res, "product");
    return;
  }
  if (input.campaignId && !(await ownsCampaign(ownerId, input.campaignId))) {
    badReference(res, "campaign");
    return;
  }
  const [row] = await db
    .update(expensesTable)
    .set({
      ...input,
      expenseDate: input.expenseDate ? dateOnly(input.expenseDate) : undefined,
    })
    .where(and(eq(expensesTable.ownerId, ownerId), eq(expensesTable.id, id)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Expense not found." });
    return;
  }
  res.json(api.UpdateExpenseResponse.parse(expenseResponse(row)));
});

router.delete("/expenses/:id", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const id = Number(req.params.id);
  const removed = await db
    .delete(expensesTable)
    .where(and(eq(expensesTable.ownerId, ownerId), eq(expensesTable.id, id)))
    .returning({ id: expensesTable.id });
  if (!removed.length) {
    res.status(404).json({ error: "Expense not found." });
    return;
  }
  res.status(204).end();
});

router.get("/dashboard", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const summary = await getDashboardSummary(ownerId);
  res.json(api.GetDashboardSummaryResponse.parse(summary));
});

router.get("/analytics/demand", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  res.json(api.GetDemandAnalyticsResponse.parse(await getDemandAnalytics(ownerId)));
});

router.get("/analytics/locations", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  res.json(api.GetLocationAnalyticsResponse.parse(await getLocationAnalytics(ownerId)));
});

router.get("/analytics/financials", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  res.json(api.GetFinancialAnalyticsResponse.parse(await getFinancialAnalytics(ownerId)));
});

router.get("/notifications", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const [stored, products, campaigns] = await Promise.all([
    getNotificationRows(ownerId),
    db.select().from(productsTable).where(eq(productsTable.ownerId, ownerId)),
    db.select().from(campaignsTable).where(eq(campaignsTable.ownerId, ownerId)),
  ]);
  const dynamic = [
    ...products
      .filter((product) => product.stock <= Math.max(5, product.targetQuantity * 0.2))
      .map((product) => ({
        id: `stock-${product.id}`,
        title: `Low stock: ${product.name}`,
        message: `${product.stock} units in stock against a target of ${product.targetQuantity}.`,
        severity: "warning",
        createdAt: createdAt(product.updatedAt),
        isSample: product.isSample,
      })),
    ...campaigns
      .filter(
        (campaign) =>
          campaign.submissionDeadline &&
          new Date(campaign.submissionDeadline).getTime() >= Date.now() &&
          new Date(campaign.submissionDeadline).getTime() <=
            Date.now() + 7 * 24 * 60 * 60 * 1000,
      )
      .map((campaign) => ({
        id: `deadline-${campaign.id}`,
        title: `Upcoming submission: ${campaign.name}`,
        message: `Submission deadline: ${campaign.submissionDeadline}.`,
        severity: "info",
        createdAt: createdAt(campaign.updatedAt),
        isSample: campaign.isSample,
      })),
  ];
  const rows = [
    ...stored.map((row) => ({
      ...row,
      id: String(row.id),
      createdAt: createdAt(row.createdAt),
    })),
    ...dynamic,
  ].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  res.json(api.ListNotificationsResponse.parse(rows));
});

router.post("/insights", async (req, res) => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId) return;
  const input = parseBody(api.AskBusinessInsightBody, req.body, res);
  if (!input) return;
  const snapshot = await loadBusinessSnapshot(ownerId);
  const context = insightContext(snapshot);
  const limitations = [
    "Answers use only records entered in this CreatorTrust workspace; no social-platform, ad-platform, courier, or store integration is connected.",
    "Sample records are fictional and should not be interpreted as business results.",
    "Views, reach, clicks, and interest are not orders. Only explicitly attributed saved orders are treated as attributed sales.",
  ];
  let answer = "I can summarize only information that has been recorded in this workspace. Add products, orders, expenses, or promotion metrics to support a more specific answer.";
  let source: "openai" | "rules" = "rules";
  if (process.env.OPENAI_API_KEY) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.2,
          max_tokens: 450,
          messages: [
            {
              role: "system",
              content:
                "You are CreatorTrust AI, an assistant for small businesses managing product promotion. Answer only from the supplied JSON, do not invent facts or claim sample data is real, do not infer real-world creator audiences, explain when evidence is missing, distinguish estimated interest from saved orders, and keep recommendations actionable. Financial values are INR. Respect the metric formulas and limitations in the data.",
            },
            {
              role: "user",
              content: JSON.stringify({ question: input.question, workspaceData: context }),
            },
          ],
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        req.log.warn({ status: response.status }, "OpenAI insight request failed");
      } else {
        const body = (await response.json()) as {
          choices?: Array<{ message?: { content?: string | null } }>;
        };
        const text = body.choices?.[0]?.message?.content?.trim();
        if (text) {
          answer = text;
          source = "openai";
        }
      }
    } catch {
      req.log.warn("OpenAI insight request was unavailable; using record-based fallback");
    }
  }
  if (source === "rules") {
    const bestProduct = context.financials.byProduct
      .filter((item) => item.revenue > 0)
      .sort((a, b) => b.profit - a.profit)[0];
    const lowStock = context.products.filter(
      (product) => product.stock <= Math.max(5, product.targetStock * 0.2),
    );
    answer = [
      `Your workspace currently has ${context.counts.products} products, ${context.counts.orders} recorded orders, and ${context.counts.campaigns} campaigns.`,
      `Recorded net sales are ₹${Math.round(context.financials.netSales).toLocaleString("en-IN")} and calculated net profit is ₹${Math.round(context.financials.netProfit).toLocaleString("en-IN")}.`,
      bestProduct
        ? `${bestProduct.name} currently has the highest recorded product profit (₹${Math.round(bestProduct.profit).toLocaleString("en-IN")}).`
        : "There are not enough recognized sales to compare product profitability.",
      lowStock.length
        ? `Stock is low against the recorded target for: ${lowStock.map((item) => item.name).join(", ")}.`
        : "No product is below the low-stock threshold calculated from its target.",
      "This record-based fallback does not use external platform or courier data.",
    ].join(" ");
  }
  res.json(
    api.AskBusinessInsightResponse.parse({
      answer,
      source,
      generatedAt: new Date().toISOString(),
      limitations,
    }),
  );
});

export default router;
