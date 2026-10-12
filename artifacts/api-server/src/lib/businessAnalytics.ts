import { desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  campaignMetricsTable,
  campaignTimelineTable,
  campaignsTable,
  customerReviewsTable,
  expensesTable,
  notificationsTable,
  ordersTable,
  productsTable,
  promotersTable,
  trackingLinksTable,
} from "@workspace/db";

export async function loadBusinessSnapshot(ownerId: string) {
  const [
    products,
    promoters,
    campaigns,
    metrics,
    links,
    orders,
    reviews,
    expenses,
  ] = await Promise.all([
    db.select().from(productsTable).where(eq(productsTable.ownerId, ownerId)),
    db.select().from(promotersTable).where(eq(promotersTable.ownerId, ownerId)),
    db.select().from(campaignsTable).where(eq(campaignsTable.ownerId, ownerId)),
    db
      .select()
      .from(campaignMetricsTable)
      .where(eq(campaignMetricsTable.ownerId, ownerId)),
    db
      .select()
      .from(trackingLinksTable)
      .where(eq(trackingLinksTable.ownerId, ownerId)),
    db.select().from(ordersTable).where(eq(ordersTable.ownerId, ownerId)),
    db
      .select()
      .from(customerReviewsTable)
      .where(eq(customerReviewsTable.ownerId, ownerId)),
    db.select().from(expensesTable).where(eq(expensesTable.ownerId, ownerId)),
  ]);
  return { products, promoters, campaigns, metrics, links, orders, reviews, expenses };
}

function orderTotal(order: {
  quantity: number;
  unitPrice: number;
  discount: number;
}): number {
  return Math.max(0, order.quantity * order.unitPrice - order.discount);
}

function isCancelled(status: string): boolean {
  return status === "cancelled" || status === "delivery_failed";
}

function isReturned(order: {
  status: string;
  returnStatus: string;
  paymentStatus: string;
}): boolean {
  return (
    order.status === "returned" ||
    order.returnStatus === "returned" ||
    order.returnStatus === "refunded" ||
    order.paymentStatus === "refunded"
  );
}

function isRecognizedSale(order: {
  status: string;
  returnStatus: string;
  paymentStatus: string;
}): boolean {
  return (
    [
      "confirmed",
      "packed",
      "shipped",
      "out_for_delivery",
      "delivered",
      "returned",
    ].includes(order.status) && !isCancelled(order.status)
  );
}

function isNetSale(order: {
  status: string;
  returnStatus: string;
  paymentStatus: string;
}): boolean {
  return isRecognizedSale(order) && !isReturned(order);
}

function sum<T>(items: T[], value: (item: T) => number): number {
  return items.reduce((total, item) => total + value(item), 0);
}

function campaignSpend(
  campaign: { id: number; agreedPrice: number; paymentStatus: string },
  expenses: { campaignId: number | null; category: string; amount: number }[],
): number {
  const agreedFee =
    campaign.paymentStatus === "paid" || campaign.paymentStatus === "partial"
      ? campaign.agreedPrice
      : 0;
  const directCosts = sum(
    expenses.filter(
      (expense) =>
        expense.campaignId === campaign.id && expense.category !== "promoter",
    ),
    (expense) => expense.amount,
  );
  return agreedFee + directCosts;
}

function finance(snapshot: Awaited<ReturnType<typeof loadBusinessSnapshot>>) {
  const { products, promoters, campaigns, orders, expenses } = snapshot;
  const recognized = orders.filter(isRecognizedSale);
  const refunds = sum(
    orders.filter(
      (order) =>
        order.paymentStatus === "refunded" ||
        order.returnStatus === "returned" ||
        order.returnStatus === "refunded",
    ),
    orderTotal,
  );
  const totalRevenue = sum(recognized, orderTotal);
  const netSales = Math.max(0, totalRevenue - refunds);
  const deliveredOrders = orders.filter(
    (order) =>
      order.status === "delivered" &&
      order.returnStatus !== "returned" &&
      order.returnStatus !== "refunded" &&
      order.paymentStatus !== "refunded",
  );
  const unitsSold = sum(deliveredOrders, (order) => order.quantity);
  const productCost = sum(deliveredOrders, (order) => {
    const product = products.find((item) => item.id === order.productId);
    return product ? product.unitCost * order.quantity : 0;
  });
  const promoterCost = sum(
    campaigns,
    (campaign) =>
      campaign.paymentStatus === "paid" || campaign.paymentStatus === "partial"
        ? campaign.agreedPrice
        : 0,
  ) + sum(
    expenses.filter(
      (expense) => expense.category === "promoter" && expense.campaignId === null,
    ),
    (expense) => expense.amount,
  );
  const otherCosts = sum(
    expenses.filter((expense) => expense.category !== "promoter"),
    (expense) => expense.amount,
  );
  const totalExpenses = productCost + promoterCost + otherCosts;
  const netProfit = netSales - totalExpenses;
  const roiFor = (revenue: number, cost: number) =>
    cost > 0 ? ((revenue - cost) / cost) * 100 : null;

  const byProduct = products.map((product) => {
    const relatedOrders = recognized.filter(isNetSale).filter(
      (order) => order.productId === product.id,
    );
    const revenue = sum(relatedOrders, orderTotal);
    const deliveredUnits = sum(
      deliveredOrders.filter((order) => order.productId === product.id),
      (order) => order.quantity,
    );
    const productExpenses =
      deliveredUnits * product.unitCost +
      sum(
        expenses.filter(
          (expense) =>
            expense.productId === product.id && expense.campaignId === null,
        ),
        (expense) => expense.amount,
      ) +
      sum(
        campaigns.filter((campaign) => campaign.productId === product.id),
        (campaign) => campaignSpend(campaign, expenses),
      );
    return {
      name: product.name,
      revenue,
      expenses: productExpenses,
      profit: revenue - productExpenses,
      roi: roiFor(revenue, productExpenses),
    };
  });

  const byCampaign = campaigns.map((campaign) => {
    const relatedOrders = recognized.filter(isNetSale).filter(
      (order) => order.campaignId === campaign.id,
    );
    const revenue = sum(relatedOrders, orderTotal);
    const deliveredUnits = sum(
      deliveredOrders.filter((order) => order.campaignId === campaign.id),
      (order) => order.quantity,
    );
    const product = products.find((item) => item.id === campaign.productId);
    const expensesForCampaign =
      campaignSpend(campaign, expenses) +
      deliveredUnits * (product?.unitCost ?? 0);
    return {
      name: campaign.name,
      revenue,
      expenses: expensesForCampaign,
      profit: revenue - expensesForCampaign,
      roi: roiFor(revenue, expensesForCampaign),
    };
  });

  const byPromoter = promoters.map((promoter) => {
    const promoterCampaigns = campaigns.filter(
      (campaign) => campaign.promoterId === promoter.id,
    );
    const campaignIds = new Set(promoterCampaigns.map((campaign) => campaign.id));
    const relatedOrders = recognized.filter(isNetSale).filter(
      (order) => order.promoterId === promoter.id || campaignIds.has(order.campaignId ?? -1),
    );
    const revenue = sum(relatedOrders, orderTotal);
    const campaignCosts = sum(promoterCampaigns, (campaign) =>
      campaignSpend(campaign, expenses),
    );
    const productCosts = sum(
      deliveredOrders.filter(
        (order) =>
          order.promoterId === promoter.id ||
          campaignIds.has(order.campaignId ?? -1),
      ),
      (order) =>
        (products.find((product) => product.id === order.productId)?.unitCost ??
          0) * order.quantity,
    );
    const totalCost = campaignCosts + productCosts;
    return {
      name: promoter.name,
      revenue,
      expenses: totalCost,
      profit: revenue - totalCost,
      roi: roiFor(revenue, totalCost),
    };
  });

  const locationMap = new Map<
    string,
    { name: string; revenue: number; expenses: number; profit: number; units: number }
  >();
  for (const order of recognized.filter(isNetSale)) {
    const name =
      [order.city, order.district, order.state].filter(Boolean).join(", ") ||
      "Location not recorded";
    const current = locationMap.get(name) ?? {
      name,
      revenue: 0,
      expenses: 0,
      profit: 0,
      units: 0,
    };
    current.revenue += orderTotal(order);
    const product = products.find((item) => item.id === order.productId);
    if (order.status === "delivered" && product) {
      current.expenses += product.unitCost * order.quantity;
    }
    current.units += order.quantity;
    current.profit = current.revenue - current.expenses;
    locationMap.set(name, current);
  }
  const byLocation = Array.from(locationMap.values()).map((item) => ({
    ...item,
    roi:
      item.expenses > 0
          ? (item.profit / item.expenses) * 100
        : null,
  }));

  const campaignRois = byCampaign
    .map((item) => item.roi)
    .filter((value): value is number => value !== null);

  return {
    currency: "INR",
    unitsOrdered: sum(
      orders.filter((order) => !isCancelled(order.status)),
      (order) => order.quantity,
    ),
    unitsSold,
    unitsDelivered: sum(
      deliveredOrders,
      (order) => order.quantity,
    ),
    cancelledUnits: sum(
      orders.filter((order) => isCancelled(order.status)),
      (order) => order.quantity,
    ),
    returnedUnits: sum(
      orders.filter(isReturned),
      (order) => order.quantity,
    ),
    grossOrderValue: sum(
      orders.filter((order) => !isCancelled(order.status)),
      (order) => order.quantity * order.unitPrice,
    ),
    totalRevenue,
    netSales,
    refunds,
    collectedPayments: sum(
      recognized.filter(
        (order) => order.paymentStatus === "paid" && !isReturned(order),
      ),
      orderTotal,
    ),
    productCost,
    promoterCost,
    otherCosts,
    totalExpenses,
    netProfit,
    profitMargin: netSales > 0 ? (netProfit / netSales) * 100 : null,
    averageOrderValue:
      recognized.length > 0 ? totalRevenue / recognized.length : null,
    averageCampaignRoi:
      campaignRois.length > 0
        ? sum(campaignRois, (value) => value) / campaignRois.length
        : null,
    byProduct,
    byPromoter,
    byCampaign,
    byLocation,
    formulas: [
      "Gross order value = quantity × unit price before discounts; cancelled/delivery-failed orders are excluded.",
      "Revenue = recognized confirmed or later-stage orders after discounts; cancelled, failed, and returned orders are excluded.",
      "Net sales = recognized revenue less recorded refunds.",
      "Product cost = unit cost × delivered, non-returned units.",
      "Promoter cost = agreed fees for campaigns marked paid/partial; other costs come from recorded expenses. Campaign-linked promoter expenses are not counted twice.",
      "Net profit = net sales − product cost − promoter cost − other recorded costs.",
      "ROI = (attributed sales − attributed costs) ÷ attributed costs × 100; attribution uses explicit campaign/order links only.",
      "Partial payment amounts are not stored, so a campaign marked partial counts its full agreed fee as committed cost; collected payments include only orders marked paid.",
    ],
  };
}

export async function getFinancialAnalytics(ownerId: string) {
  const snapshot = await loadBusinessSnapshot(ownerId);
  return finance(snapshot);
}

export async function getDashboardSummary(ownerId: string) {
  const snapshot = await loadBusinessSnapshot(ownerId);
  const { products, promoters, campaigns, metrics, links, orders, reviews } = snapshot;
  const financials = finance(snapshot);
  const timeline = await db
    .select()
    .from(campaignTimelineTable)
    .where(eq(campaignTimelineTable.ownerId, ownerId));
  const recentActivity = [
    ...orders.map((order) => ({
      id: `order-${order.id}`,
      title: `Order ${order.orderCode}`,
      detail: `${order.status.replaceAll("_", " ")} · ${order.quantity} unit${order.quantity === 1 ? "" : "s"}`,
      occurredAt: order.createdAt.toISOString(),
    })),
    ...timeline.map((entry) => ({
      id: `timeline-${entry.id}`,
      title: `Campaign ${entry.stage.replaceAll("_", " ")}`,
      detail: entry.note,
      occurredAt: entry.occurredAt.toISOString(),
    })),
  ]
    .sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    )
    .slice(0, 8);

  const metricsByCampaign = (campaignId: number) =>
    metrics.filter((metric) => metric.campaignId === campaignId);
  const campaignsPerformance = campaigns
    .filter((campaign) => campaign.status !== "draft")
    .map((campaign) => {
      const promoter = promoters.find((item) => item.id === campaign.promoterId);
      const relatedOrders = orders.filter(
        (order) => order.campaignId === campaign.id && isNetSale(order),
      );
      return {
        campaignId: campaign.id,
        campaignName: campaign.name,
        promoterName: promoter?.name ?? "Promoter not found",
        clicks: sum(metricsByCampaign(campaign.id), (item) => item.linkClicks),
        orders: relatedOrders.length,
        reach: sum(metricsByCampaign(campaign.id), (item) => item.reach),
        investment:
          campaign.paymentStatus === "paid" ||
          campaign.paymentStatus === "partial"
            ? campaign.agreedPrice
            : 0,
      };
    });

  const monthKeys = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (5 - index));
    return date.toISOString().slice(0, 7);
  });
  const monthlySales = monthKeys.map((month) => {
    const monthOrders = orders.filter(
      (order) => order.orderDate.slice(0, 7) === month && isNetSale(order),
    );
    const monthExpenses = snapshot.expenses.filter(
      (expense) => expense.expenseDate.slice(0, 7) === month,
    );
    const monthCampaigns = campaigns.filter(
      (campaign) =>
        (campaign.startDate ?? campaign.createdAt.toISOString().slice(0, 10)).slice(
          0,
          7,
        ) === month &&
        (campaign.paymentStatus === "paid" || campaign.paymentStatus === "partial"),
    );
    const monthProductCost = sum(
      orders.filter(
        (order) =>
          order.orderDate.slice(0, 7) === month &&
          order.status === "delivered" &&
          !isReturned(order),
      ),
      (order) =>
        (products.find((product) => product.id === order.productId)?.unitCost ??
          0) * order.quantity,
    );
    return {
      month,
      revenue: sum(monthOrders, orderTotal),
      expenses:
        sum(monthExpenses, (expense) => expense.amount) +
        monthProductCost +
        sum(monthCampaigns, (campaign) => campaign.agreedPrice),
    };
  });

  const reviewAverage =
    reviews.length > 0
      ? sum(reviews, (review) => review.rating) / reviews.length
      : null;
  const submittedEntries = timeline.filter((entry) =>
    ["content", "video", "submission"].some((stage) =>
      entry.stage.toLowerCase().includes(stage),
    ),
  );
  const hasSample = [
    ...products,
    ...promoters,
    ...campaigns,
    ...orders,
    ...reviews,
    ...metrics,
    ...links,
    ...timeline,
  ].some((row) => row.isSample);

  return {
    currency: financials.currency,
    productCount: products.length,
    promoterCount: promoters.length,
    shortlistedCount: promoters.filter((item) => item.isShortlisted).length,
    activeCampaignCount: campaigns.filter((item) =>
      ["accepted", "active"].includes(item.status),
    ).length,
    videosSubmitted: submittedEntries.length,
    videosPublished: timeline.filter(
      (entry) =>
        entry.stage.toLowerCase().includes("publication") &&
        ["completed", "approved"].includes(entry.status),
    ).length,
    audienceReach: sum(metrics, (item) => item.reach),
    interestedCustomers: sum(metrics, (item) => item.interestedCustomers),
    linkClicks: sum(links, (item) => item.clicks),
    orderCount: orders.length,
    deliveredOrders: orders.filter((item) => item.status === "delivered").length,
    unitsSold: financials.unitsSold,
    satisfaction: reviewAverage,
    productDemand: sum(metrics, (item) => item.interestedCustomers),
    totalRevenue: financials.netSales,
    totalExpenses: financials.totalExpenses,
    netProfit: financials.netProfit,
    averageCampaignRoi: financials.averageCampaignRoi,
    monthlySales,
    campaignPerformance: campaignsPerformance,
    recentActivity,
    isSampleWorkspace: hasSample,
  };
}

export async function getDemandAnalytics(ownerId: string) {
  const snapshot = await loadBusinessSnapshot(ownerId);
  const { products, campaigns, metrics, orders } = snapshot;
  const productDemand = products.map((product) => {
    const campaignIds = new Set(
      campaigns
        .filter((campaign) => campaign.productId === product.id)
        .map((campaign) => campaign.id),
    );
    const relatedMetrics = metrics.filter((metric) =>
      campaignIds.has(metric.campaignId),
    );
    const relatedOrders = orders.filter(
      (order) => order.productId === product.id && isNetSale(order),
    );
    return {
      name: product.name,
      interest: sum(relatedMetrics, (item) => item.interestedCustomers),
      orders: relatedOrders.length,
      units: sum(relatedOrders, (item) => item.quantity),
      revenue: sum(relatedOrders, orderTotal),
    };
  });

  const locations = new Map<string, { interest: number; orders: number; units: number; revenue: number }>();
  for (const order of orders.filter(isNetSale)) {
    const name = [order.city, order.district, order.state].filter(Boolean).join(", ") || "Location not recorded";
    const current = locations.get(name) ?? { interest: 0, orders: 0, units: 0, revenue: 0 };
    current.orders += 1;
    current.units += order.quantity;
    current.revenue += orderTotal(order);
    locations.set(name, current);
  }
  for (const metric of metrics) {
    if (!metric.audienceLocation) continue;
    const name = metric.audienceLocation;
    const current = locations.get(name) ?? { interest: 0, orders: 0, units: 0, revenue: 0 };
    current.interest += metric.interestedCustomers;
    locations.set(name, current);
  }

  const variants = new Map<string, { interest: number; orders: number; units: number; revenue: number }>();
  for (const order of orders.filter(isNetSale)) {
    const productName =
      products.find((product) => product.id === order.productId)?.name ??
      "Product not found";
    const name = `${productName} · ${order.variant || "Variant not recorded"}`;
    const current = variants.get(name) ?? { interest: 0, orders: 0, units: 0, revenue: 0 };
    current.orders += 1;
    current.units += order.quantity;
    current.revenue += orderTotal(order);
    variants.set(name, current);
  }

  const highInterestLowPurchase = productDemand
    .filter((item) => item.interest > item.orders && item.interest >= 5)
    .map((item) => item.name);
  const lowStockProducts = products
    .filter((product) => product.stock <= Math.max(5, product.targetQuantity * 0.2))
    .map((product) => product.name);
  const recommendations = [
    ...lowStockProducts.map((name) => `${name}: recorded stock is at or below 20% of its target (minimum threshold 5). Review replenishment before increasing promotion.`),
    ...highInterestLowPurchase.map((name) => `${name}: recorded customer interest exceeds attributed order count. Check offer, availability, and checkout information; this is not a forecast.`),
  ];
  if (recommendations.length === 0) {
    recommendations.push(
      products.length === 0
        ? "Add a product and enter sales or promotion data to calculate demand."
        : "No low-stock or high-interest/low-order signals are present in the records entered.",
    );
  }

  return {
    highInterestLowPurchase,
    lowStockProducts,
    productDemand,
    locationDemand: Array.from(locations, ([name, values]) => ({ name, ...values })),
    variantDemand: Array.from(variants, ([name, values]) => ({ name, ...values })),
    recommendations,
    isEstimate: true,
  };
}

export async function getLocationAnalytics(ownerId: string) {
  const snapshot = await loadBusinessSnapshot(ownerId);
  const grouped = new Map<
    string,
    {
      state: string;
      district: string;
      city: string;
      pinCode: string;
      orders: number;
      units: number;
      revenue: number;
      delivered: number;
      pending: number;
      failed: number;
      cancelled: number;
      returned: number;
      interested: number;
    }
  >();

  for (const order of snapshot.orders) {
    const state = order.state ?? "Not recorded";
    const district = order.district ?? "Not recorded";
    const city = order.city ?? "Not recorded";
    const pinCode = order.pinCode ?? "Not recorded";
    const key = [state, district, city, pinCode].join("|");
    const current = grouped.get(key) ?? {
      state,
      district,
      city,
      pinCode,
      orders: 0,
      units: 0,
      revenue: 0,
      delivered: 0,
      pending: 0,
      failed: 0,
      cancelled: 0,
      returned: 0,
      interested: 0,
    };
    current.orders += 1;
    current.units += order.quantity;
    if (isNetSale(order)) current.revenue += orderTotal(order);
    if (order.status === "delivered") current.delivered += 1;
    if (["placed", "confirmed", "packed", "shipped", "out_for_delivery"].includes(order.status)) {
      current.pending += 1;
    }
    if (order.status === "delivery_failed") current.failed += 1;
    if (order.status === "cancelled") current.cancelled += 1;
    if (order.status === "returned" || ["returned", "refunded"].includes(order.returnStatus)) {
      current.returned += 1;
    }
    grouped.set(key, current);
  }

  for (const metric of snapshot.metrics) {
    if (!metric.audienceLocation) continue;
    const match = Array.from(grouped.values()).find(
      (item) =>
        item.state === metric.audienceLocation ||
        item.district === metric.audienceLocation ||
        item.city === metric.audienceLocation,
    );
    if (match) match.interested += metric.interestedCustomers;
  }

  return { locations: Array.from(grouped.values()) };
}

export async function getNotificationRows(ownerId: string) {
  return db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.ownerId, ownerId))
    .orderBy(desc(notificationsTable.createdAt));
}

export function insightContext(snapshot: Awaited<ReturnType<typeof loadBusinessSnapshot>>) {
  const summaryFinancials = finance(snapshot);
  return {
    counts: {
      products: snapshot.products.length,
      promoters: snapshot.promoters.length,
      campaigns: snapshot.campaigns.length,
      orders: snapshot.orders.length,
      reviews: snapshot.reviews.length,
      recordedMetrics: snapshot.metrics.length,
    },
    financials: summaryFinancials,
    products: snapshot.products.map((product) => ({
      name: product.name,
      price: product.sellingPrice,
      unitCost: product.unitCost,
      stock: product.stock,
      targetStock: product.targetQuantity,
    })),
    campaignMetrics: snapshot.metrics.map((metric) => ({
      date: metric.metricDate,
      reach: metric.reach,
      views: metric.views,
      clicks: metric.linkClicks,
      interest: metric.interestedCustomers,
      source: metric.source,
      verified: metric.verified,
    })),
    dataIncludesSamples: [
      ...snapshot.products,
      ...snapshot.promoters,
      ...snapshot.campaigns,
      ...snapshot.orders,
      ...snapshot.reviews,
      ...snapshot.metrics,
    ].some((row) => row.isSample),
  };
}
