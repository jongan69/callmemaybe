import prisma from "../db.server";
import { decrypt, hashForMatching } from "../lib/crypto.server";
import { createError, ErrorCodes } from "../lib/errors.server";
import { getProviderMode } from "../providers/index.server";
import { normalizePhone } from "./consent.server";
import { getUsageSnapshot, hasActiveEntitlement } from "./billing.server";
import {
  CALL_SCRIPT_VERSION,
  resolveRegionPolicyTimeZone,
} from "../lib/regions";

export type CallEligibilityReason =
  | "ALLOWED"
  | "GLOBAL_KILL_SWITCH"
  | "SHOP_NOT_CONFIGURED"
  | "SUBSCRIPTION_INACTIVE"
  | "USAGE_LIMIT_REACHED"
  | "PHONE_INVALID"
  | "REGION_DISABLED"
  | "REGION_NOT_APPROVED"
  | "REGION_NOT_ENABLED_FOR_SHOP"
  | "CALLING_WINDOW_CLOSED"
  | "PHONE_SUPPRESSED"
  | "CONSENT_REQUIRED"
  | "CONSENT_MISMATCH"
  | "CONSENT_EXPIRED"
  | "CALLBACK_REQUEST_EXPIRED"
  | "ATTEMPT_LIMIT_REACHED"
  | "ATTEMPT_TOO_SOON"
  | "DAILY_RATE_LIMIT"
  | "CONCURRENCY_LIMIT"
  | "IDENTITY_CHALLENGE_UNAVAILABLE"
  | "CARRIER_APPROVAL_REQUIRED";

export type CallEligibilityResult = {
  allowed: boolean;
  reasons: CallEligibilityReason[];
  region: string | null;
  phoneHash: string | null;
};

export function isWithinCallingWindow(params: {
  now: Date;
  timeZone: string;
  start: string;
  end: string;
}): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: params.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(params.now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? "0",
  );
  const current = hour * 60 + minute;
  const [startHour, startMinute] = params.start.split(":").map(Number);
  const [endHour, endMinute] = params.end.split(":").map(Number);
  return (
    current >= startHour * 60 + startMinute &&
    current < endHour * 60 + endMinute
  );
}

export async function evaluateCallEligibility(params: {
  shopId: string;
  supportCaseId: string;
  callPlanId: string;
  now?: Date;
}): Promise<CallEligibilityResult> {
  const now = params.now ?? new Date();
  const [settings, supportCase, callPlan] = await Promise.all([
    prisma.shopSettings.findUnique({ where: { id: params.shopId } }),
    prisma.supportCase.findUnique({
      where: { id: params.supportCaseId },
      include: { consent: true, verificationChallenge: true },
    }),
    prisma.callPlan.findUnique({ where: { id: params.callPlanId } }),
  ]);
  if (
    !settings ||
    !supportCase ||
    !callPlan ||
    supportCase.shopId !== params.shopId ||
    callPlan.supportCaseId !== supportCase.id
  ) {
    return persistDecision(params, {
      allowed: false,
      reasons: ["SHOP_NOT_CONFIGURED"],
      region: null,
      phoneHash: null,
    });
  }

  const reasons: CallEligibilityReason[] = [];
  const purpose =
    callPlan.recipientKind === "THIRD_PARTY"
      ? "CARRIER_TRACE"
      : "ORDER_SUPPORT";
  if (supportCase.requestExpiresAt && supportCase.requestExpiresAt <= now) {
    reasons.push("CALLBACK_REQUEST_EXPIRED");
  }
  if (!settings.globalCallingEnabled) reasons.push("GLOBAL_KILL_SWITCH");
  if (!(await hasActiveEntitlement(settings.id, now)))
    reasons.push("SUBSCRIPTION_INACTIVE");
  const usage = await getUsageSnapshot(settings.id, now);
  if (usage.hardLimitReached) reasons.push("USAGE_LIMIT_REACHED");

  const encryptedRecipient =
    callPlan.recipientKind === "THIRD_PARTY"
      ? callPlan.recipientPhoneEncrypted
      : supportCase.customerPhoneEncrypted;
  const recipient = encryptedRecipient
    ? normalizePhone(decrypt(encryptedRecipient))
    : null;
  if (!recipient) reasons.push("PHONE_INVALID");
  const phoneHash = recipient ? hashForMatching(recipient.e164) : null;

  let regionPolicy: Awaited<ReturnType<typeof prisma.regionPolicy.findFirst>> =
    null;
  if (recipient) {
    regionPolicy = await prisma.regionPolicy.findFirst({
      where: { countryCode: recipient.region },
      orderBy: { version: "desc" },
    });
    if (!regionPolicy?.enabled || regionPolicy.disabledAt)
      reasons.push("REGION_DISABLED");
    if (
      !regionPolicy?.legalApprovedAt ||
      !regionPolicy.productionApprovedAt ||
      !regionPolicy.effectiveAt ||
      regionPolicy.effectiveAt > now ||
      !regionPolicy.calleLineId ||
      !regionPolicy.legalApprovalReference ||
      !regionPolicy.vendorApprovalReference ||
      !regionPolicy.localizationApprovedAt ||
      !regionPolicy.localizationApprovalReference ||
      !resolveRegionPolicyTimeZone(regionPolicy.timezoneStrategy) ||
      regionPolicy.callScriptVersion !== CALL_SCRIPT_VERSION
    )
      reasons.push("REGION_NOT_APPROVED");
    const enabledRegions = safeStringArray(settings.enabledRegionsJson);
    if (!enabledRegions.includes(recipient.region))
      reasons.push("REGION_NOT_ENABLED_FOR_SHOP");
    if (regionPolicy) {
      const metadata = safeObject(callPlan.metadataJson);
      const permittedPurposes = safeStringArray(
        regionPolicy.permittedPurposesJson,
      );
      if (!permittedPurposes.includes(purpose)) reasons.push("REGION_DISABLED");
      const locale =
        typeof metadata.locale === "string"
          ? metadata.locale.toLowerCase().split("-")[0]
          : settings.defaultLocale.toLowerCase().split("-")[0];
      if (!safeStringArray(regionPolicy.localesJson).includes(locale)) {
        reasons.push("REGION_DISABLED");
      }
      const recipientTimeZone = resolveRegionPolicyTimeZone(
        regionPolicy.timezoneStrategy,
      );
      try {
        if (
          !recipientTimeZone ||
          !isWithinCallingWindow({
            now,
            timeZone: recipientTimeZone,
            start: regionPolicy.callWindowStart,
            end: regionPolicy.callWindowEnd,
          })
        )
          reasons.push("CALLING_WINDOW_CLOSED");
      } catch {
        reasons.push("CALLING_WINDOW_CLOSED");
      }
    }
    const suppression = await prisma.suppressionEntry.findFirst({
      where: {
        phoneHash: phoneHash!,
        scope: { in: ["global", `shop:${settings.id}`] },
        effectiveAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });
    if (suppression) reasons.push("PHONE_SUPPRESSED");
  }

  const recentAttempts = await prisma.callAttempt.findMany({
    where: {
      supportCase: {
        shopId: settings.id,
        shopifyOrderId: supportCase.shopifyOrderId,
        customerPhoneHash: supportCase.customerPhoneHash,
      },
      providerCallId: { not: null },
      createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
  });
  const attemptsToday = recentAttempts.filter(
    (attempt) =>
      attempt.createdAt >= new Date(now.getTime() - 24 * 60 * 60 * 1000),
  );
  if (attemptsToday.length >= settings.maxCallsPerCustomerPerDay)
    reasons.push("DAILY_RATE_LIMIT");
  const activeCalls = await prisma.callAttempt.count({
    where: {
      supportCase: { shopId: settings.id },
      status: {
        in: [
          "PENDING",
          "QUEUED",
          "INITIATED",
          "RINGING",
          "IN_PROGRESS",
          "CALLING",
        ],
      },
    },
  });
  if (activeCalls >= settings.maxConcurrentCalls)
    reasons.push("CONCURRENCY_LIMIT");

  if (callPlan.recipientKind === "CUSTOMER") {
    const consent = supportCase.consent;
    if (!consent) {
      reasons.push("CONSENT_REQUIRED");
    } else {
      if (
        consent.shopId !== settings.id ||
        consent.shopifyOrderId !== supportCase.shopifyOrderId ||
        consent.shopifyCustomerId !== supportCase.shopifyCustomerId ||
        consent.phoneHash !== phoneHash ||
        consent.purpose !== purpose
      )
        reasons.push("CONSENT_MISMATCH");
      if (consent.revokedAt || consent.expiresAt <= now)
        reasons.push("CONSENT_EXPIRED");
      if (recentAttempts.length >= consent.maxAttempts)
        reasons.push("ATTEMPT_LIMIT_REACHED");
      if (
        recentAttempts[0] &&
        now.getTime() - recentAttempts[0].createdAt.getTime() <
          24 * 60 * 60 * 1000
      ) {
        reasons.push("ATTEMPT_TOO_SOON");
      }
    }
    const challenge = supportCase.verificationChallenge;
    if (
      !challenge ||
      challenge.expiresAt <= now ||
      challenge.invalidatedAt ||
      challenge.verifiedAt
    ) {
      reasons.push("IDENTITY_CHALLENGE_UNAVAILABLE");
    }
  } else {
    if (!callPlan.approvedAt || !callPlan.approvedBy) {
      reasons.push("CARRIER_APPROVAL_REQUIRED");
    }
    const carrier = phoneHash
      ? await prisma.carrierEndpoint.findFirst({
          where: {
            shopId: settings.id,
            phoneHash,
            enabled: true,
            verifiedAt: { not: null },
          },
        })
      : null;
    if (!carrier) reasons.push("CARRIER_APPROVAL_REQUIRED");
  }

  // The provider mode is read here so malformed or ambiguous environment
  // configuration fails before a call attempt record is created.
  getProviderMode();

  return persistDecision(params, {
    allowed: reasons.length === 0,
    reasons: reasons.length === 0 ? ["ALLOWED"] : [...new Set(reasons)],
    region: recipient?.region ?? null,
    phoneHash,
  });
}

async function persistDecision(
  params: { shopId: string; supportCaseId: string; callPlanId: string },
  result: CallEligibilityResult,
): Promise<CallEligibilityResult> {
  const callPlan = await prisma.callPlan.findUnique({
    where: { id: params.callPlanId },
    select: { recipientKind: true },
  });
  await prisma.callEligibilityDecision.create({
    data: {
      shopId: params.shopId,
      supportCaseId: params.supportCaseId,
      callPlanId: params.callPlanId,
      phoneHash: result.phoneHash,
      region: result.region,
      purpose:
        callPlan?.recipientKind === "THIRD_PARTY"
          ? "CARRIER_TRACE"
          : "ORDER_SUPPORT",
      allowed: result.allowed,
      reasonCodesJson: JSON.stringify(result.reasons),
    },
  });
  return result;
}

export async function assertCallEligible(params: {
  shopId: string;
  supportCaseId: string;
  callPlanId: string;
}): Promise<CallEligibilityResult> {
  const result = await evaluateCallEligibility(params);
  if (!result.allowed) {
    throw createError(
      result.reasons.includes("CONSENT_REQUIRED")
        ? ErrorCodes.CONSENT_REQUIRED
        : ErrorCodes.POLICY_BLOCKED,
      `Call blocked by eligibility policy: ${result.reasons.join(", ")}`,
      "This call is not currently eligible. Review consent, calling hours, regional approval, and billing status.",
      { metadata: { reasons: result.reasons } },
    );
  }
  return result;
}

function safeStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) &&
      parsed.every((item) => typeof item === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function safeObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
