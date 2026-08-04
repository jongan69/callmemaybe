import { PrismaClient } from "@prisma/client";
import { DEFAULT_POLICIES } from "../app/lib/types";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding CallmeMaybe demo data...");

  // Demo shop settings
  const shopId = "demo-shop-northstar";
  const shopDomain = "northstar-supply-co.myshopify.com";

  await prisma.shopSettings.upsert({
    where: { shopDomain },
    create: {
      id: shopId,
      shopDomain,
      shopifyShopId: "gid://shopify/Shop/999999999",
      storeName: "Northstar Supply Co.",
      supportDepartmentName: "Customer Care",
      agentName: "Riley",
      timezone: "America/Los_Angeles",
      defaultLocale: "en-US",
      humanEscalationEmail: "support@northstarsupplyco.com",
      callProviderMode: "fake",
      realCallsEnabled: false,
      confidenceThreshold: 0.85,
      maxCallsPerCustomerPerDay: 2,
      transcriptRetentionDays: 30,
    },
    update: {},
  });

  // Default policies
  for (const policy of DEFAULT_POLICIES) {
    await prisma.supportPolicy.upsert({
      where: { shopId_issueType: { shopId, issueType: policy.issueType } },
      create: {
        shopId,
        issueType: policy.issueType,
        enabled: policy.enabled,
        mode: policy.mode,
        conditionsJson: JSON.stringify(policy),
      },
      update: {},
    });
  }

  // Set ADDRESS_CHANGE to AUTOMATIC for demo purposes (unfulfilled orders)
  await prisma.supportPolicy.update({
    where: { shopId_issueType: { shopId, issueType: "ADDRESS_CHANGE" } },
    data: { mode: "AUTOMATIC" },
  });

  // Demo knowledge sources
  const knowledgeEntries = [
    {
      title: "Shipping Policy",
      content: "Northstar Supply Co. ships within 1-2 business days. Standard shipping takes 3-7 business days. Express shipping takes 1-3 business days. You will receive a tracking number once your order ships. Shipping addresses can be changed before the order is fulfilled. International shipping is available to select countries.",
      appliesTo: ["ORDER_STATUS", "ADDRESS_CHANGE"],
    },
    {
      title: "Return Policy",
      content: "Returns are accepted within 30 days of delivery. Items must be unused and in original packaging. To initiate a return, contact support or use the Returns page in your account. Refunds are processed within 5-10 business days after we receive the returned items. Final sale items cannot be returned.",
      appliesTo: ["RETURN", "DAMAGED_ITEM", "WRONG_ITEM"],
    },
    {
      title: "Cancellation Policy",
      content: "Orders can be canceled before they are fulfilled. Once an order has shipped, it cannot be canceled but can be returned after delivery. To cancel an order, contact support as soon as possible.",
      appliesTo: ["CANCELLATION"],
    },
    {
      title: "Damaged or Missing Items",
      content: "If your order arrives damaged or with missing items, please contact support within 48 hours of delivery. We will arrange a replacement or refund. Photos of damaged items may be requested to process your claim.",
      appliesTo: ["DAMAGED_ITEM", "MISSING_ITEM", "WRONG_ITEM"],
    },
  ];

  for (const entry of knowledgeEntries) {
    await prisma.knowledgeSource.create({
      data: {
        shopId,
        sourceType: "CUSTOM",
        title: entry.title,
        normalizedContent: entry.content,
        contentHash: entry.content,
        appliesToJson: JSON.stringify(entry.appliesTo),
        status: "active",
      },
    });
  }

  // ── Stuck orders ────────────────────────────────────────────
  //
  // The demo thread: one order the carrier marked delivered that the customer
  // never received, and whose customer has since gone quiet on email. It needs
  // a carrier leg first, then a customer leg. The other two exist so the
  // outreach queue does not look staged.
  //
  // CARRIER_SUPPORT_PHONE must point at a line you control. Do not put a real
  // carrier's number here — see docs/DEMO_SCRIPT.md on using a stand-in.
  const standInCarrierPhone = process.env.DEMO_CARRIER_PHONE ?? "";
  const demoCustomerPhone = process.env.DEMO_CUSTOMER_PHONE ?? "";

  const stuckOrders = [
    {
      shopifyOrderId: "gid://shopify/Order/1043",
      shopifyOrderName: "#1043",
      shopifyCustomerId: "gid://shopify/Customer/5501",
      customerName: "Alex Johnson",
      customerPhone: demoCustomerPhone,
      blockerDescription:
        "Carrier marked the package delivered on 28 July. Customer replied to the delivery notification saying it never arrived, then stopped responding.",
      emailAttempts: 2,
      valueMinor: 12400,
      currencyCode: "USD",
      carrierName: "Northline Freight",
      carrierSupportPhone: standInCarrierPhone,
      trackingNumber: "NL4820199317",
      shipDate: "24 July 2026",
      deliveryClaimDate: "28 July 2026",
      shipToSummary: "front porch, 118 Cedar Street, Portland OR 97214",
    },
    {
      shopifyOrderId: "gid://shopify/Order/1051",
      shopifyOrderName: "#1051",
      shopifyCustomerId: "gid://shopify/Customer/5522",
      customerName: "Priya Raman",
      customerPhone: demoCustomerPhone,
      blockerDescription:
        "Shipping address is missing an apartment number and the carrier returned it as undeliverable. Two emails sent, no reply.",
      emailAttempts: 2,
      valueMinor: 8400,
      currencyCode: "USD",
    },
    {
      shopifyOrderId: "gid://shopify/Order/1058",
      shopifyOrderName: "#1058",
      shopifyCustomerId: "gid://shopify/Customer/5540",
      customerName: "Marcus Webb",
      customerPhone: demoCustomerPhone,
      blockerDescription:
        "Ordered item is out of stock until October. Needs a decision on the substitute colourway or a refund. Three emails sent, no reply.",
      emailAttempts: 3,
      valueMinor: 21900,
      currencyCode: "USD",
    },
  ];

  for (const order of stuckOrders) {
    await prisma.stuckOrder.upsert({
      where: {
        shopId_shopifyOrderId: {
          shopId,
          shopifyOrderId: order.shopifyOrderId,
        },
      },
      create: { shopId, ...order },
      update: {},
    });
  }

  console.log("✅ Demo seed complete!");
  console.log("   Shop: Northstar Supply Co.");
  console.log("   Policies: 11 defaults + ADDRESS_CHANGE set to AUTOMATIC");
  console.log("   Knowledge: 4 sources synced");
  console.log(`   Stuck orders: ${stuckOrders.length} queued for outreach`);

  if (!standInCarrierPhone || !demoCustomerPhone) {
    console.log("");
    console.log("⚠️  DEMO_CARRIER_PHONE and/or DEMO_CUSTOMER_PHONE are unset.");
    console.log("   Outreach will fail on phone validation until both are set");
    console.log("   in .env to E.164 numbers you control.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
