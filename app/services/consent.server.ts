import { parsePhoneNumberFromString } from "libphonenumber-js";
import prisma from "../db.server";
import { hashForMatching } from "../lib/crypto.server";
import {
  CONSENT_TEXT_VERSION,
  REGION_DEFINITIONS,
  consentText,
  normalizeSupportedLocale,
} from "../lib/regions";
import { createAuditEvent } from "./audit.server";

export type ConsentSource = "customer_account" | "thank_you" | "reviewer_demo";

export function normalizePhone(
  phone: string,
): { e164: string; region: string } | null {
  const parsed = parsePhoneNumberFromString(phone);
  if (!parsed?.isValid() || !parsed.country) return null;
  if (
    !REGION_DEFINITIONS.some((region) => region.countryCode === parsed.country)
  )
    return null;
  return { e164: parsed.number, region: parsed.country };
}

export async function grantCallConsent(params: {
  shopId: string;
  shopifyOrderId: string;
  shopifyCustomerId: string;
  phone: string;
  purpose: string;
  source: ConsentSource;
  locale: string;
  storeName: string;
  sessionTokenSubject?: string;
  ipHash?: string;
  userAgentSummary?: string;
}) {
  const normalized = normalizePhone(params.phone);
  if (!normalized)
    throw new Error("The order does not have a supported E.164 phone number.");
  const phoneHash = hashForMatching(normalized.e164);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const locale = normalizeSupportedLocale(params.locale);

  const consent = await prisma.$transaction(async (tx) => {
    await tx.callConsent.updateMany({
      where: {
        shopId: params.shopId,
        shopifyOrderId: params.shopifyOrderId,
        shopifyCustomerId: params.shopifyCustomerId,
        purpose: params.purpose,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { revokedAt: now, revocationReason: "superseded" },
    });

    return tx.callConsent.create({
      data: {
        shopId: params.shopId,
        shopifyOrderId: params.shopifyOrderId,
        shopifyCustomerId: params.shopifyCustomerId,
        purpose: params.purpose,
        source: params.source,
        consentTextVersion: CONSENT_TEXT_VERSION,
        consentText: consentText(locale, params.storeName),
        phoneHash,
        locale,
        region: normalized.region,
        maxAttempts: 2,
        sessionTokenSubjectHash: params.sessionTokenSubject
          ? hashForMatching(params.sessionTokenSubject)
          : null,
        ipHash: params.ipHash,
        userAgentSummary: params.userAgentSummary,
        expiresAt,
      },
    });
  });
  await createAuditEvent({
    shopId: params.shopId,
    actorType: "customer",
    actorId: params.shopifyCustomerId,
    action: "consent.granted",
    resourceType: "call_consent",
    resourceId: consent.id,
    metadata: {
      orderIdHash: hashForMatching(params.shopifyOrderId),
      purpose: params.purpose,
      source: params.source,
      locale,
      region: normalized.region,
      consentTextVersion: CONSENT_TEXT_VERSION,
      expiresAt: consent.expiresAt.toISOString(),
    },
  });
  return consent;
}

export async function findActiveCallConsent(params: {
  shopId: string;
  shopifyOrderId: string;
  shopifyCustomerId: string;
  phone: string;
  purpose?: string;
}) {
  const normalized = normalizePhone(params.phone);
  if (!normalized) return null;
  const now = new Date();
  return prisma.callConsent.findFirst({
    where: {
      shopId: params.shopId,
      shopifyOrderId: params.shopifyOrderId,
      shopifyCustomerId: params.shopifyCustomerId,
      phoneHash: hashForMatching(normalized.e164),
      ...(params.purpose ? { purpose: params.purpose } : {}),
      revokedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { grantedAt: "desc" },
  });
}

export async function revokeCallConsent(params: {
  shopId: string;
  shopifyOrderId: string;
  shopifyCustomerId: string;
  reason: string;
  suppressPhone?: boolean;
}) {
  const active = await prisma.callConsent.findMany({
    where: {
      shopId: params.shopId,
      shopifyOrderId: params.shopifyOrderId,
      shopifyCustomerId: params.shopifyCustomerId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.callConsent.updateMany({
      where: { id: { in: active.map((consent) => consent.id) } },
      data: { revokedAt: now, revocationReason: params.reason },
    });
    if (params.suppressPhone) {
      for (const consent of active) {
        await tx.suppressionEntry.upsert({
          where: {
            scope_phoneHash: {
              scope: `shop:${params.shopId}`,
              phoneHash: consent.phoneHash,
            },
          },
          create: {
            scope: `shop:${params.shopId}`,
            shopId: params.shopId,
            phoneHash: consent.phoneHash,
            reason: params.reason,
            source: "customer_revocation",
          },
          update: {
            reason: params.reason,
            source: "customer_revocation",
            effectiveAt: now,
            expiresAt: null,
          },
        });
      }
    }
  });
  await createAuditEvent({
    shopId: params.shopId,
    actorType: "customer",
    actorId: params.shopifyCustomerId,
    action: "consent.revoked",
    resourceType: "call_consent",
    metadata: {
      orderIdHash: hashForMatching(params.shopifyOrderId),
      reason: params.reason,
      revokedCount: active.length,
      suppressed: params.suppressPhone === true,
    },
  });
  return { revoked: active.length };
}

export async function suppressPhone(params: {
  shopId: string;
  phone: string;
  reason: string;
  source: string;
}) {
  const normalized = normalizePhone(params.phone);
  if (!normalized) return null;
  const phoneHash = hashForMatching(normalized.e164);
  return prisma.suppressionEntry.upsert({
    where: { scope_phoneHash: { scope: `shop:${params.shopId}`, phoneHash } },
    create: {
      scope: `shop:${params.shopId}`,
      shopId: params.shopId,
      phoneHash,
      reason: params.reason,
      source: params.source,
    },
    update: {
      reason: params.reason,
      source: params.source,
      effectiveAt: new Date(),
      expiresAt: null,
    },
  });
}
