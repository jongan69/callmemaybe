import type { Prisma } from "@prisma/client";
import db from "../db.server";
import { decrypt, encrypt, hashForMatching } from "../lib/crypto.server";

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
  await tx.auditEvent.deleteMany({ where: { supportCaseId: { in: supportCaseIds } } });
  await tx.usageLedger.deleteMany({ where: { supportCaseId: { in: supportCaseIds } } });
  await tx.callAttempt.deleteMany({ where: { supportCaseId: { in: supportCaseIds } } });
  await tx.callPlan.deleteMany({ where: { supportCaseId: { in: supportCaseIds } } });
  await tx.resolutionProposal.deleteMany({ where: { supportCaseId: { in: supportCaseIds } } });
  await tx.verificationChallenge.deleteMany({ where: { supportCaseId: { in: supportCaseIds } } });
  await tx.callbackConsent.deleteMany({ where: { supportCaseId: { in: supportCaseIds } } });
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
          transcriptRedacted: true,
          createdAt: true,
          completedAt: true,
        },
      },
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
        email: decryptOptional(supportCase.customerEmailEncrypted),
        phone: decryptOptional(supportCase.customerPhoneEncrypted),
      },
      consent: supportCase.consent
        ? {
            text: supportCase.consent.consentText,
            textVersion: supportCase.consent.consentTextVersion,
            consentedAt: supportCase.consent.consentedAt,
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
    await deleteCaseGraph(tx, cases.map(({ id }) => id));
    await tx.stuckOrder.deleteMany({
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
    await tx.privacyRequest.deleteMany({
      where: { shopDomain, customerIdHash: customerHash },
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
      await deleteCaseGraph(tx, cases.map(({ id }) => id));
      await tx.stuckOrder.deleteMany({ where: { shopId: shop.id } });
      await tx.knowledgeSource.deleteMany({ where: { shopId: shop.id } });
      await tx.supportPolicy.deleteMany({ where: { shopId: shop.id } });
      await tx.auditEvent.deleteMany({ where: { shopId: shop.id } });
      await tx.usageLedger.deleteMany({ where: { shopId: shop.id } });
      await tx.shopSettings.delete({ where: { id: shop.id } });
    }
    await tx.privacyRequest.deleteMany({ where: { shopDomain } });
    await tx.session.deleteMany({ where: { shop: shopDomain } });
  });
}

export async function purgeExpiredPrivateData(
  shopDomain: string,
  shopId: string,
  transcriptRetentionDays: number,
) {
  const now = new Date();
  const transcriptCutoff = new Date(
    now.getTime() - transcriptRetentionDays * 24 * 60 * 60 * 1000,
  );

  const [exportsDeleted, transcriptsPurged] = await db.$transaction([
    db.privacyRequest.deleteMany({
      where: { shopDomain, expiresAt: { lte: now } },
    }),
    db.callAttempt.updateMany({
      where: {
        supportCase: { shopId },
        completedAt: { lte: transcriptCutoff },
      },
      data: {
        transcriptEncrypted: null,
        transcriptRedacted: null,
      },
    }),
  ]);

  return {
    exportsDeleted: exportsDeleted.count,
    transcriptsPurged: transcriptsPurged.count,
  };
}

export function decryptPrivacyExport(ciphertext: string): unknown {
  return JSON.parse(decrypt(ciphertext));
}
