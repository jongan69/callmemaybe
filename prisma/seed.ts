import { PrismaClient } from "@prisma/client";
import { DEFAULT_POLICIES } from "../app/lib/types";

const prisma = new PrismaClient();

async function main() {
  // Only seed if explicitly opted in via DEMO_SEED=true.
  // In production, merchants configure their own settings through the app UI.
  if (process.env.DEMO_SEED !== "true") {
    console.log("Skipping seed — set DEMO_SEED=true to populate demo data.");
    return;
  }

  console.log("Seeding CallmeMaybe demo data...");

  const shopDomain = process.env.DEMO_SHOP_DOMAIN || "callmemaybe-demo.myshopify.com";
  const shopId = `seed-${shopDomain.replace(/\./g, "-")}`;
  const storeName = process.env.DEMO_STORE_NAME || "My Store";
  const carrierPhone = process.env.DEMO_CARRIER_PHONE || "";
  const customerPhone = process.env.DEMO_CUSTOMER_PHONE || "";

  await prisma.shopSettings.upsert({
    where: { shopDomain },
    create: {
      id: shopId,
      shopDomain,
      shopifyShopId: "gid://shopify/Shop/seed",
      storeName,
      supportDepartmentName: "Customer Care",
      agentName: "Riley",
      timezone: "America/Los_Angeles",
      defaultLocale: "en-US",
      humanEscalationEmail: "",
      callProviderMode: "fake",
      realCallsEnabled: false,
      confidenceThreshold: 0.85,
      maxCallsPerCustomerPerDay: 5,
      transcriptRetentionDays: 30,
    },
    update: {},
  });

  // Upsert default policies
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

  // Demo stuck orders — only if phone numbers are provided
  if (carrierPhone && customerPhone) {
    const orders = [
      {
        shopifyOrderId: "gid://shopify/Order/demo-1043",
        shopifyOrderName: "#1043",
        shopifyCustomerId: "gid://shopify/Customer/demo-5501",
        customerName: "Alex Johnson",
        customerPhone,
        blockerDescription: "Carrier marked delivered 28 July. Customer says never arrived, stopped replying.",
        emailAttempts: 2,
        valueMinor: 12400,
        currencyCode: "USD",
        carrierName: "Northline Freight",
        carrierSupportPhone: carrierPhone,
        trackingNumber: "NL4820199317",
        shipDate: "24 July 2026",
        deliveryClaimDate: "28 July 2026",
        shipToSummary: "front porch, 118 Cedar Street, Portland OR 97214",
      },
    ];

    for (const order of orders) {
      await prisma.stuckOrder.upsert({
        where: { shopId_shopifyOrderId: { shopId, shopifyOrderId: order.shopifyOrderId } },
        create: { shopId, ...order },
        update: {},
      });
    }
    console.log(`  ${orders.length} demo stuck order(s) seeded`);
  }

  console.log("Demo seed complete.");
  console.log(`  Shop: ${storeName} (${shopDomain})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
