import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

const money = (name: string) =>
  numeric(name, { precision: 14, scale: 2, mode: "number" });
const stringArray = (name: string) =>
  jsonb(name).$type<string[]>().notNull().default(sql`'[]'::jsonb`);
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const ownerIndex = (table: { ownerId: any; id: any }, name: string) =>
  index(name).on(table.ownerId, table.id);

export const creatorWorkspaceTable = pgTable("creator_workspace", {
  ownerId: varchar("owner_id", { length: 255 }).primaryKey(),
  demoSeeded: boolean("demo_seeded").notNull().default(true),
  createdAt: createdAt(),
});

export const productsTable = pgTable(
  "creator_products",
  {
    id: serial("id").primaryKey(),
    ownerId: varchar("owner_id", { length: 255 }).notNull(),
    name: text("name").notNull(),
    imageUrl: text("image_url"),
    category: text("category").notNull(),
    description: text("description").notNull().default(""),
    sellingPrice: money("selling_price").notNull().default(0),
    unitCost: money("unit_cost").notNull().default(0),
    stock: integer("stock").notNull().default(0),
    targetQuantity: integer("target_quantity").notNull().default(0),
    qualityDetails: text("quality_details").notNull().default(""),
    colors: stringArray("colors"),
    sizes: stringArray("sizes"),
    purchaseUrl: text("purchase_url"),
    targetAudience: text("target_audience").notNull().default(""),
    targetLocations: stringArray("target_locations"),
    promotionBudget: money("promotion_budget").notNull().default(0),
    launchDate: date("launch_date", { mode: "string" }),
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [ownerIndex(table, "creator_products_owner_id_idx")],
);

export const promotersTable = pgTable(
  "creator_promoters",
  {
    id: serial("id").primaryKey(),
    ownerId: varchar("owner_id", { length: 255 }).notNull(),
    name: text("name").notNull(),
    profileUrl: text("profile_url"),
    platform: text("platform").notNull(),
    contentCategory: text("content_category").notNull(),
    audienceInterests: stringArray("audience_interests"),
    audienceLocations: stringArray("audience_locations"),
    followers: integer("followers").notNull().default(0),
    engagementRate: numeric("engagement_rate", {
      precision: 7,
      scale: 3,
      mode: "number",
    }),
    averageViews: integer("average_views"),
    previousPerformance: text("previous_performance").notNull().default(""),
    rating: numeric("rating", {
      precision: 3,
      scale: 2,
      mode: "number",
    }),
    costPerVideo: money("cost_per_video"),
    costPerPost: money("cost_per_post"),
    costPerStory: money("cost_per_story"),
    quoteAmount: money("quote_amount").notNull().default(0),
    deliverables: stringArray("deliverables"),
    contact: text("contact"),
    dataSource: text("data_source").notNull().default("Manual entry"),
    verificationStatus: text("verification_status").notNull().default("manual"),
    isShortlisted: boolean("is_shortlisted").notNull().default(false),
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [ownerIndex(table, "creator_promoters_owner_id_idx")],
);

export const promoterReviewsTable = pgTable(
  "creator_promoter_reviews",
  {
    id: serial("id").primaryKey(),
    ownerId: varchar("owner_id", { length: 255 }).notNull(),
    promoterId: integer("promoter_id").notNull(),
    rating: integer("rating").notNull(),
    positiveFeedback: text("positive_feedback").notNull().default(""),
    negativeFeedback: text("negative_feedback").notNull().default(""),
    source: text("source").notNull().default("Manual"),
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [ownerIndex(table, "creator_promoter_reviews_owner_id_idx")],
);

export const campaignsTable = pgTable(
  "creator_campaigns",
  {
    id: serial("id").primaryKey(),
    ownerId: varchar("owner_id", { length: 255 }).notNull(),
    name: text("name").notNull(),
    productId: integer("product_id").notNull(),
    promoterId: integer("promoter_id").notNull(),
    status: text("status").notNull().default("draft"),
    agreedPrice: money("agreed_price").notNull().default(0),
    videoCount: integer("video_count").notNull().default(0),
    postCount: integer("post_count").notNull().default(0),
    requiredContent: text("required_content").notNull().default(""),
    productLink: text("product_link"),
    startDate: date("start_date", { mode: "string" }),
    submissionDeadline: date("submission_deadline", { mode: "string" }),
    publicationDeadline: date("publication_deadline", { mode: "string" }),
    paymentStatus: text("payment_status").notNull().default("unpaid"),
    revisionTerms: text("revision_terms").notNull().default(""),
    deliverables: stringArray("deliverables"),
    campaignTerms: text("campaign_terms").notNull().default(""),
    agreementObjectPath: text("agreement_object_path"),
    agreementConfirmed: boolean("agreement_confirmed").notNull().default(false),
    currentStage: text("current_stage").notNull().default("brief"),
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [ownerIndex(table, "creator_campaigns_owner_id_idx")],
);

export const campaignTimelineTable = pgTable(
  "creator_campaign_timeline",
  {
    id: serial("id").primaryKey(),
    ownerId: varchar("owner_id", { length: 255 }).notNull(),
    campaignId: integer("campaign_id").notNull(),
    stage: text("stage").notNull(),
    status: text("status").notNull(),
    note: text("note").notNull().default(""),
    evidenceUrl: text("evidence_url"),
    postUrl: text("post_url"),
    revisionReason: text("revision_reason"),
    approvalDetails: text("approval_details"),
    deadline: date("deadline", { mode: "string" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    isSample: boolean("is_sample").notNull().default(false),
  },
  (table) => [ownerIndex(table, "creator_campaign_timeline_owner_id_idx")],
);

export const campaignMetricsTable = pgTable(
  "creator_campaign_metrics",
  {
    id: serial("id").primaryKey(),
    ownerId: varchar("owner_id", { length: 255 }).notNull(),
    campaignId: integer("campaign_id").notNull(),
    metricDate: date("metric_date", { mode: "string" }).notNull(),
    views: integer("views").notNull().default(0),
    reach: integer("reach").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    saves: integer("saves").notNull().default(0),
    linkClicks: integer("link_clicks").notNull().default(0),
    enquiries: integer("enquiries").notNull().default(0),
    interestedCustomers: integer("interested_customers").notNull().default(0),
    addToCart: integer("add_to_cart").notNull().default(0),
    attributedOrders: integer("attributed_orders").notNull().default(0),
    audienceLocation: text("audience_location"),
    source: text("source").notNull().default("Manual"),
    verified: boolean("verified").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    isSample: boolean("is_sample").notNull().default(false),
  },
  (table) => [ownerIndex(table, "creator_campaign_metrics_owner_id_idx")],
);

export const trackingLinksTable = pgTable(
  "creator_tracking_links",
  {
    id: serial("id").primaryKey(),
    ownerId: varchar("owner_id", { length: 255 }).notNull(),
    campaignId: integer("campaign_id").notNull(),
    promoterId: integer("promoter_id").notNull(),
    code: varchar("code", { length: 32 }).notNull().unique(),
    destinationUrl: text("destination_url").notNull(),
    clicks: integer("clicks").notNull().default(0),
    createdAt: createdAt(),
    isSample: boolean("is_sample").notNull().default(false),
  },
  (table) => [ownerIndex(table, "creator_tracking_links_owner_id_idx")],
);

export const ordersTable = pgTable(
  "creator_orders",
  {
    id: serial("id").primaryKey(),
    ownerId: varchar("owner_id", { length: 255 }).notNull(),
    orderCode: text("order_code").notNull(),
    orderDate: date("order_date", { mode: "string" }).notNull(),
    productId: integer("product_id").notNull(),
    variant: text("variant").notNull().default(""),
    quantity: integer("quantity").notNull(),
    unitPrice: money("unit_price").notNull(),
    discount: money("discount").notNull().default(0),
    customerRef: text("customer_ref"),
    city: text("city"),
    district: text("district"),
    state: text("state"),
    pinCode: text("pin_code"),
    paymentStatus: text("payment_status").notNull().default("pending"),
    campaignId: integer("campaign_id"),
    promoterId: integer("promoter_id"),
    source: text("source").notNull().default("Manual"),
    status: text("status").notNull().default("placed"),
    returnStatus: text("return_status").notNull().default("none"),
    trackingNumber: text("tracking_number"),
    courier: text("courier"),
    dispatchDate: date("dispatch_date", { mode: "string" }),
    deliveryDate: date("delivery_date", { mode: "string" }),
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    ownerIndex(table, "creator_orders_owner_id_idx"),
    uniqueIndex("creator_orders_owner_code_unique").on(
      table.ownerId,
      table.orderCode,
    ),
  ],
);

export const customerReviewsTable = pgTable(
  "creator_customer_reviews",
  {
    id: serial("id").primaryKey(),
    ownerId: varchar("owner_id", { length: 255 }).notNull(),
    orderId: integer("order_id").notNull(),
    productId: integer("product_id").notNull(),
    rating: integer("rating").notNull(),
    qualityRating: integer("quality_rating").notNull(),
    colorMatches: boolean("color_matches").notNull(),
    metExpectations: boolean("met_expectations").notNull(),
    valueRating: integer("value_rating").notNull(),
    priceSatisfaction: integer("price_satisfaction").notNull(),
    packagingRating: integer("packaging_rating").notNull(),
    deliveryRating: integer("delivery_rating").notNull(),
    recommend: boolean("recommend").notNull(),
    buyAgain: boolean("buy_again").notNull(),
    comments: text("comments").notNull().default(""),
    variant: text("variant").notNull().default(""),
    location: text("location"),
    reviewDate: date("review_date", { mode: "string" }).notNull(),
    isSample: boolean("is_sample").notNull().default(false),
  },
  (table) => [ownerIndex(table, "creator_customer_reviews_owner_id_idx")],
);

export const expensesTable = pgTable(
  "creator_expenses",
  {
    id: serial("id").primaryKey(),
    ownerId: varchar("owner_id", { length: 255 }).notNull(),
    productId: integer("product_id"),
    campaignId: integer("campaign_id"),
    category: text("category").notNull(),
    amount: money("amount").notNull(),
    expenseDate: date("expense_date", { mode: "string" }).notNull(),
    notes: text("notes").notNull().default(""),
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [ownerIndex(table, "creator_expenses_owner_id_idx")],
);

export const notificationsTable = pgTable(
  "creator_notifications",
  {
    id: serial("id").primaryKey(),
    ownerId: varchar("owner_id", { length: 255 }).notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    severity: text("severity").notNull().default("info"),
    createdAt: createdAt(),
    isSample: boolean("is_sample").notNull().default(false),
  },
  (table) => [ownerIndex(table, "creator_notifications_owner_id_idx")],
);
