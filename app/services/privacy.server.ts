import type { Prisma } from "@prisma/client";
import db from "../db.server";
import { decrypt, encrypt, hashForMatching } from "../lib/crypto.server";
import { createAuditEvent } from "./audit.server";

type CustomerPrivacyPayload = {
  customer?: { id?: string | number | null };
  orders_requested?: Array<string | number>;
  orders_to_redact?: Array<string | number>;
};

function customerGid(id: string | number): string {
  const value = String(id);
  return value.startsWith("gid://") ? value : `gid://shopify/Customer/${value}`;
}

function orderGids(ids: Array<string | number> | undefined): string[] {
  return (ids ?? []).map((id) => {
    const value = String(id);
    return value.startsWith("gid://") ? value : `gid://shopify/Order/${value}`;
  });
}

function decryptOptional(value: string | null): string | null {
  if (!value) return null;
  try {
    return decrypt(value);
  } catch {
    return null;
  }
}

async function deleteCaseGraph(
  tx: Prisma.TransactionClient,
  supportCaseIds: string[],
) {
  if (supportCaseIds.length === 0) return;

  const attempts = await tx.callAttempt.findMany({
    where: { supportCaseId: { in: supportCaseIds } },
    select: { id: true },
  });
  const proposals = await tx.resolutionProposal.findMany({
    where: { supportCaseId: { in: supportCaseIds } },
    select: { id: true },
  });

  await tx.callEvent.deleteMany({
    where: { callAttemptId: { in: attempts.map(({ id }) => id) } },
  });
  await tx.resolutionExecution.deleteMany({
    where: { resolutionProposalId: { in: proposals.map(({ id }) => id) } },
  });
  await tx.auditEvent.deleteMany({
    where: { supportCaseId: { in: supportCaseIds } },
  });
  await tx.callEligibilityDecision.deleteMany({
    where: { supportCaseId: { in: supportCaseIds } },
  });
  await tx.usageLedger.deleteMany({
    where: { supportCaseId: { in: supportCaseIds } },
  });
  await tx.callAttempt.deleteMany({
    where: { supportCaseId: { in: supportCaseIds } },
  });
  await tx.callPlan.deleteMany({
    where: { supportCaseId: { in: supportCaseIds } },
  });
  await tx.resolutionProposal.deleteMany({
    where: { supportCaseId: { in: supportCaseIds } },
  });
  await tx.verificationChallenge.deleteMany({
    where: { supportCaseId: { in: supportCaseIds } },
  });
  await tx.supportCase.deleteMany({ where: { id: { in: supportCaseIds } } });
}

export async function prepareCustomerDataExport(
  shopDomain: string,
  payload: CustomerPrivacyPayload,
) {
  if (payload.customer?.id == null) {
    throw new Error("Customer data request is missing customer.id");
  }

  const customerId = customerGid(payload.customer.id);
  const requestedOrders = orderGids(payload.orders_requested);
  const shop = await db.shopSettings.findUnique({ where: { shopDomain } });
  if (!shop) return { customerId, cases: [] };

  const cases = await db.supportCase.findMany({
    where: {
      shopId: shop.id,
      OR: [
        { shopifyCustomerId: customerId },
        ...(requestedOrders.length > 0
          ? [{ shopifyOrderId: { in: requestedOrders } }]
          : []),
      ],
    },
    include: {
      consent: true,
      callAttempts: {
        select: {
          status: true,
          outcome: true,
          summary: true,
          createdAt: true,
          completedAt: true,
        },
      },
    },
  });

  await createAuditEvent({
    shopId: shop.id,
    actorType: "webhook",
    action: "protected_data.customer_export_prepared",
    resourceType: "privacy_request",
    metadata: {
      caseCount: cases.length,
      purpose: "shopify_customer_data_request",
    },
  });
  return {
    generatedAt: new Date().toISOString(),
    customerId,
    cases: cases.map((supportCase) => ({
      reference: supportCase.publicReference,
      orderId: supportCase.shopifyOrderId,
      orderName: supportCase.shopifyOrderName,
      issueType: supportCase.issueType,
      issueSummary: supportCase.customerIssueSummary,
      status: supportCase.status,
      requestedAt: supportCase.requestedAt,
      resolvedAt: supportCase.resolvedAt,
      customer: {
        name: decryptOptional(supportCase.customerNameEncrypted),
        phone: decryptOptional(supportCase.customerPhoneEncrypted),
      },
      consent: supportCase.consent
        ? {
            text: supportCase.consent.consentText,
            textVersion: supportCase.consent.consentTextVersion,
            grantedAt: supportCase.consent.grantedAt,
            expiresAt: supportCase.consent.expiresAt,
            revokedAt: supportCase.consent.revokedAt,
          }
        : null,
      calls: supportCase.callAttempts,
    })),
  };
}

export async function recordCustomerDataRequest(
  shopDomain: string,
  eventId: string | undefined,
  payload: CustomerPrivacyPayload,
) {
  if (payload.customer?.id == null) {
    throw new Error("Customer data request is missing customer.id");
  }
  const eventHash = hashForMatching(
    `privacy:${shopDomain}:${eventId ?? JSON.stringify(payload)}`,
  );
  await db.privacyRequest.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
  const existing = await db.privacyRequest.findUnique({
    where: { webhookEventIdHash: eventHash },
  });
  if (existing) return existing;

  const customerId = customerGid(payload.customer.id);
  const data = await prepareCustomerDataExport(shopDomain, payload);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  return db.privacyRequest.create({
    data: {
      shopDomain,
      topic: "CUSTOMERS_DATA_REQUEST",
      webhookEventIdHash: eventHash,
      customerIdHash: hashForMatching(customerId),
      status: "READY_FOR_MERCHANT",
      exportEncrypted: encrypt(JSON.stringify(data)),
      completedAt: new Date(),
      expiresAt,
    },
  });
}

export async function createPrivacyRequestReceipt(params: {
  shopDomain: string;
  topic: "CUSTOMERS_DATA_REQUEST" | "CUSTOMERS_REDACT" | "SHOP_REDACT";
  eventId?: string;
  payload: CustomerPrivacyPayload;
}) {
  const eventHash = hashForMatching(
    `privacy:${params.shopDomain}:${params.eventId ?? JSON.stringify(params.payload)}`,
  );
  const existing = await db.privacyRequest.findUnique({
    where: { webhookEventIdHash: eventHash },
  });
  if (existing) return { request: existing, duplicate: true };
  const rawCustomerId = params.payload.customer?.id;
  const request = await db.privacyRequest.create({
    data: {
      shopDomain: params.shopDomain,
      topic: params.topic,
      webhookEventIdHash: eventHash,
      customerIdHash:
        rawCustomerId == null
          ? null
          : hashForMatching(customerGid(rawCustomerId)),
      status: "RECEIVED",
      payloadEncrypted: encrypt(JSON.stringify(params.payload)),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  return { request, duplicate: false };
}

export async function processPrivacyRequest(requestId: string) {
  const request = await db.privacyRequest.findUnique({
    where: { id: requestId },
  });
  if (
    !request ||
    request.status === "COMPLETED" ||
    request.status === "READY_FOR_MERCHANT"
  ) {
    return request;
  }
  if (!request.payloadEncrypted)
    throw new Error("Privacy request payload is unavailable");
  const payload = JSON.parse(
    decrypt(request.payloadEncrypted),
  ) as CustomerPrivacyPayload;
  await db.privacyRequest.update({
    where: { id: request.id },
    data: { status: "PROCESSING" },
  });
  try {
    if (request.topic === "CUSTOMERS_DATA_REQUEST") {
      const data = await prepareCustomerDataExport(request.shopDomain, payload);
      return db.privacyRequest.update({
        where: { id: request.id },
        data: {
          status: "READY_FOR_MERCHANT",
          exportEncrypted: encrypt(JSON.stringify(data)),
          payloadEncrypted: null,
          completedAt: new Date(),
        },
      });
    }
    if (request.topic === "CUSTOMERS_REDACT") {
      await redactCustomerData(request.shopDomain, payload);
    } else if (request.topic === "SHOP_REDACT") {
      await redactShopData(request.shopDomain);
    } else {
      throw new Error(`Unsupported privacy topic ${request.topic}`);
    }
    return db.privacyRequest.update({
      where: { id: request.id },
      data: {
        status: "COMPLETED",
        payloadEncrypted: null,
        exportEncrypted: null,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    await db.privacyRequest.update({
      where: { id: request.id },
      data: {
        status: "FAILED",
        errorMessage:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Privacy job failed",
      },
    });
    throw error;
  }
}

export async function redactCustomerData(
  shopDomain: string,
  payload: CustomerPrivacyPayload,
) {
  if (payload.customer?.id == null) {
    throw new Error("Customer redaction request is missing customer.id");
  }
  const customerId = customerGid(payload.customer.id);
  const redactedOrders = orderGids(payload.orders_to_redact);
  const customerHash = hashForMatching(customerId);

  await db.$transaction(async (tx) => {
    const shop = await tx.shopSettings.findUnique({ where: { shopDomain } });
    if (!shop) return;
    const cases = await tx.supportCase.findMany({
      where: {
        shopId: shop.id,
        OR: [
          { shopifyCustomerId: customerId },
          ...(redactedOrders.length > 0
            ? [{ shopifyOrderId: { in: redactedOrders } }]
            : []),
        ],
      },
      select: { id: true },
    });
    await deleteCaseGraph(
      tx,
      cases.map(({ id }) => id),
    );
    await tx.callConsent.deleteMany({
      where: {
        shopId: shop.id,
        OR: [
          { shopifyCustomerId: customerId },
          ...(redactedOrders.length > 0
            ? [{ shopifyOrderId: { in: redactedOrders } }]
            : []),
        ],
      },
    });
    await tx.privacyRequest.updateMany({
      where: { shopDomain, customerIdHash: customerHash },
      data: { exportEncrypted: null, payloadEncrypted: null },
    });
  });
}

export async function redactShopData(shopDomain: string) {
  await db.$transaction(async (tx) => {
    const shop = await tx.shopSettings.findUnique({ where: { shopDomain } });
    if (shop) {
      const cases = await tx.supportCase.findMany({
        where: { shopId: shop.id },
        select: { id: true },
      });
      await deleteCaseGraph(
        tx,
        cases.map(({ id }) => id),
      );
      await tx.callConsent.deleteMany({ where: { shopId: shop.id } });
      await tx.suppressionEntry.deleteMany({ where: { shopId: shop.id } });
      await tx.carrierEndpoint.deleteMany({ where: { shopId: shop.id } });
      await tx.callEligibilityDecision.deleteMany({
        where: { shopId: shop.id },
      });
      await tx.shopSubscription.deleteMany({ where: { shopId: shop.id } });
      await tx.knowledgeSource.deleteMany({ where: { shopId: shop.id } });
      await tx.supportPolicy.deleteMany({ where: { shopId: shop.id } });
      await tx.auditEvent.deleteMany({ where: { shopId: shop.id } });
      await tx.usageLedger.deleteMany({ where: { shopId: shop.id } });
      await tx.shopSettings.delete({ where: { id: shop.id } });
    }
    await tx.privacyRequest.updateMany({
      where: { shopDomain },
      data: { exportEncrypted: null, payloadEncrypted: null },
    });
    await tx.session.deleteMany({ where: { shop: shopDomain } });
  });
}

export async function purgeExpiredPrivateData(
  shopDomain: string,
  shopId: string,
) {
  const now = new Date();

  const exportsDeleted = await db.privacyRequest.deleteMany({
    where: { shopDomain, expiresAt: { lte: now } },
  });
  const closedCases = await db.supportCase.findMany({
    where: {
      shopId,
      closedAt: { not: null },
    },
    select: { id: true, closedAt: true, consent: { select: { region: true } } },
  });
  const regions = [
    ...new Set(
      closedCases
        .map((supportCase) => supportCase.consent?.region)
        .filter((region): region is string => Boolean(region)),
    ),
  ];
  const policies = await db.regionPolicy.findMany({
    where: { countryCode: { in: regions } },
    orderBy: [{ countryCode: "asc" }, { version: "desc" }],
  });
  const retentionByRegion = new Map<string, number>();
  for (const policy of policies) {
    if (!retentionByRegion.has(policy.countryCode)) {
      retentionByRegion.set(policy.countryCode, policy.dataRetentionDays);
    }
  }
  const expiredCases = closedCases.filter((supportCase) => {
    const retentionDays = supportCase.consent?.region
      ? (retentionByRegion.get(supportCase.consent.region) ?? 90)
      : 90;
    const cutoff = new Date(
      now.getTime() - retentionDays * 24 * 60 * 60 * 1000,
    );
    return Boolean(supportCase.closedAt && supportCase.closedAt <= cutoff);
  });
  await db.$transaction((tx) =>
    deleteCaseGraph(
      tx,
      expiredCases.map(({ id }) => id),
    ),
  );

  return {
    exportsDeleted: exportsDeleted.count,
    casesPurged: expiredCases.length,
  };
}

export function decryptPrivacyExport(ciphertext: string): unknown {
  return JSON.parse(decrypt(ciphertext));
}
