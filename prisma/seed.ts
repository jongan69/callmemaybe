import { PrismaClient } from "@prisma/client";
import { DEFAULT_POLICIES } from "../app/lib/types";
import {
  CALL_SCRIPT_VERSION,
  CONSENT_TEXT_VERSION,
  REGION_DEFINITIONS,
} from "../app/lib/regions";
import { encrypt, hashForMatching } from "../app/lib/crypto.server";

const prisma = new PrismaClient();

async function main() {
  const demoSeed = process.env.DEMO_SEED === "true";
  const shopDomain = process.env.DEMO_SHOP_DOMAIN;
  const storeName = process.env.DEMO_STORE_NAME || "Northstar Supply Co.";
  const carrierPhone = process.env.DEMO_CARRIER_PHONE;
  const now = new Date();
  const cycleStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const cycleEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  if (demoSeed && !shopDomain?.endsWith(".myshopify.com")) {
    throw new Error(
      "DEMO_SHOP_DOMAIN must name the already-installed Shopify development store.",
    );
  }
  if (demoSeed && (!carrierPhone || !/^\+[1-9]\d{7,14}$/.test(carrierPhone))) {
    throw new Error(
      "DEMO_CARRIER_PHONE must be an E.164 number controlled by the demo operator.",
    );
  }
  const installedShop = demoSeed
    ? await prisma.shopSettings.findUnique({ where: { shopDomain: shopDomain! } })
    : null;
  if (demoSeed && !installedShop) {
    throw new Error(
      `Demo seed refused: install the app on ${shopDomain} and complete initial setup before seeding.`,
    );
  }

  for (const definition of REGION_DEFINITIONS) {
    const demoEnabled = demoSeed && definition.countryCode === "US";
    await prisma.regionPolicy.upsert({
      where: { countryCode_version: { countryCode: definition.countryCode, version: 1 } },
      create: {
        countryCode: definition.countryCode,
        version: 1,
        countryName: definition.countryName,
        callingCode: definition.callingCode,
        timezoneStrategy: demoEnabled ? "fixed:UTC" : "disabled",
        localesJson: JSON.stringify(definition.locales),
        permittedPurposesJson: JSON.stringify(["ORDER_SUPPORT", "CARRIER_TRACE"]),
        consentTextVersion: CONSENT_TEXT_VERSION,
        callScriptVersion: CALL_SCRIPT_VERSION,
        aiDisclosureText: "This is an AI-assisted support call.",
        suppressionRulesJson: JSON.stringify({
          honorCustomerRevocation: true,
          honorSpokenOptOut: true,
          regionalDncReviewRequired: true,
        }),
        callWindowStart: demoEnabled ? "00:00" : "09:00",
        callWindowEnd: demoEnabled ? "23:59" : "20:00",
        enabled: demoEnabled,
        calleLineId: demoEnabled ? "DEMO-ONLY" : null,
        legalApprovalReference: demoEnabled ? "DEMO-ONLY-NOT-A-LEGAL-APPROVAL" : null,
        vendorApprovalReference: demoEnabled ? "DEMO-ONLY-NOT-A-VENDOR-APPROVAL" : null,
        localizationApprovalReference: demoEnabled
          ? "DEMO-ONLY-NOT-A-LOCALIZATION-APPROVAL"
          : null,
        legalApprovedAt: demoEnabled ? now : null,
        productionApprovedAt: demoEnabled ? now : null,
        localizationApprovedAt: demoEnabled ? now : null,
        effectiveAt: demoEnabled ? now : null,
      },
      update: demoEnabled
        ? {
            timezoneStrategy: "fixed:UTC",
            callWindowStart: "00:00",
            callWindowEnd: "23:59",
            enabled: true,
            disabledAt: null,
            calleLineId: "DEMO-ONLY",
            legalApprovalReference: "DEMO-ONLY-NOT-A-LEGAL-APPROVAL",
            vendorApprovalReference: "DEMO-ONLY-NOT-A-VENDOR-APPROVAL",
            localizationApprovalReference:
              "DEMO-ONLY-NOT-A-LOCALIZATION-APPROVAL",
            legalApprovedAt: now,
            productionApprovedAt: now,
            localizationApprovedAt: now,
            effectiveAt: now,
          }
        : {},
    });
  }
  console.log(`Ensured ${REGION_DEFINITIONS.length} disabled-by-default regional policy records.`);

  if (!demoSeed) {
    console.log("Skipping demo records — set DEMO_SEED=true only in an isolated demo environment.");
    return;
  }

  // The guarded lookup above proves these values exist without creating a fake
  // Shopify tenant. Keep the non-null assertions local to the demo-only path.
  const demoShop = installedShop!;
  const demoCarrierPhone = carrierPhone!;
  const demoShopDomain = shopDomain!;
  const shopId = demoShop.id;

  console.log(`Seeding isolated demo store ${demoShopDomain}...`);
  await prisma.shopSettings.update({
    where: { id: shopId },
    data: {
      storeName,
      supportDepartmentName: "Customer Care",
      agentName: "Riley",
      timezone: "America/Los_Angeles",
      defaultLocale: "en-US",
      globalCallingEnabled: true,
      enabledRegionsJson: JSON.stringify(["US"]),
      businessIdentity: storeName,
      termsAcceptedAt: now,
      termsVersion: process.env.LEGAL_DOCUMENT_VERSION || "DEMO-ONLY",
      confidenceThreshold: 0.85,
      maxCallsPerCustomerPerDay: 2,
    },
  });

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

  await prisma.shopSubscription.upsert({
    where: { shopId },
    create: {
      shopId,
      shopifyShopId: demoShop.shopifyShopId,
      planHandle: "callmemaybe-monthly",
      status: "TRIAL",
      billingPeriod: "EVERY_30_DAYS",
      trialEndsAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
      currentCycleStart: cycleStart,
      currentCycleEnd: cycleEnd,
      synchronizedAt: now,
    },
    update: {
      shopifyShopId: demoShop.shopifyShopId,
      planHandle: "callmemaybe-monthly",
      status: "TRIAL",
      billingPeriod: "EVERY_30_DAYS",
      trialEndsAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
      currentCycleStart: cycleStart,
      currentCycleEnd: cycleEnd,
      synchronizedAt: now,
    },
  });

  await prisma.carrierEndpoint.upsert({
      where: {
        shopId_phoneHash: {
          shopId,
          phoneHash: hashForMatching(demoCarrierPhone),
        },
      },
      create: {
        shopId,
        carrierName: process.env.DEMO_CARRIER_NAME || "Demo carrier",
        phoneEncrypted: encrypt(demoCarrierPhone),
        phoneHash: hashForMatching(demoCarrierPhone),
        phoneLastFour: demoCarrierPhone.slice(-4),
        countryCode: process.env.DEMO_CARRIER_REGION || "US",
        verificationSource: "demo_environment",
        verificationReference: "DEMO-ONLY",
        verifiedBy: "seed",
        verifiedAt: now,
      },
      update: {
        carrierName: process.env.DEMO_CARRIER_NAME || "Demo carrier",
        countryCode: process.env.DEMO_CARRIER_REGION || "US",
        verificationSource: "demo_environment",
        verificationReference: "DEMO-ONLY",
        verifiedBy: "seed",
        verifiedAt: now,
        enabled: true,
      },
    });

  console.log("Demo seed complete. No customer phone number or order PII was persisted.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
