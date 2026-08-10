import prisma from "../db.server";
import { sha256Hash } from "../lib/crypto.server";

export const BILLING_PLAN = {
  monthlyPriceMinor: 2900,
  includedCalls: 250,
  trialCalls: 25,
  overageUnitPriceMinor: 10,
  maximumOverageMinor: 20_000,
  maximumCallsPerCycle: 2_250,
  eventHandle: "completed_call_overage",
} as const;

export type UsageWarning = {
  scope: "included" | "overage";
  threshold: 80 | 90 | 100;
  percentage: number;
};

export function getUsageWarnings(params: {
  completedCalls: number;
  includedLimit: number;
}): UsageWarning[] {
  const overageLimit =
    BILLING_PLAN.maximumCallsPerCycle - BILLING_PLAN.includedCalls;
  const values = [
    {
      scope: "included" as const,
      percentage: Math.floor(
        (params.completedCalls / Math.max(1, params.includedLimit)) * 100,
      ),
    },
    {
      scope: "overage" as const,
      percentage: Math.floor(
        (Math.max(0, params.completedCalls - params.includedLimit) /
          overageLimit) *
          100,
      ),
    },
  ];
  return values.flatMap(({ scope, percentage }) => {
    const threshold =
      percentage >= 100
        ? 100
        : percentage >= 90
          ? 90
          : percentage >= 80
            ? 80
            : null;
    return threshold ? [{ scope, threshold, percentage }] : [];
  });
}

type BillingCycle = { start: Date; end: Date; trial: boolean };

let appEventsToken: { value: string; expiresAt: number } | null = null;

function currentCalendarCycle(now = new Date()): BillingCycle {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  return { start, end, trial: false };
}

export async function getBillingCycle(
  shopId: string,
  now = new Date(),
): Promise<BillingCycle> {
  const subscription = await prisma.shopSubscription.findUnique({
    where: { shopId },
  });
  if (!subscription?.currentCycleStart || !subscription.currentCycleEnd) {
    return currentCalendarCycle(now);
  }
  return {
    start: subscription.currentCycleStart,
    end: subscription.currentCycleEnd,
    trial: Boolean(subscription.trialEndsAt && subscription.trialEndsAt > now),
  };
}

export async function getUsageSnapshot(shopId: string, now = new Date()) {
  const cycle = await getBillingCycle(shopId, now);
  const completedCalls = await prisma.usageLedger.count({
    where: {
      shopId,
      usageType: "COMPLETED_CALL",
      reversedAt: null,
      occurredAt: { gte: cycle.start, lt: cycle.end },
    },
  });
  const includedLimit = cycle.trial
    ? BILLING_PLAN.trialCalls
    : BILLING_PLAN.includedCalls;
  return {
    ...cycle,
    completedCalls,
    includedLimit,
    overageCalls: Math.max(0, completedCalls - includedLimit),
    remainingCalls: Math.max(
      0,
      BILLING_PLAN.maximumCallsPerCycle - completedCalls,
    ),
    hardLimitReached: completedCalls >= BILLING_PLAN.maximumCallsPerCycle,
  };
}

export async function hasActiveEntitlement(
  shopId: string,
  now = new Date(),
): Promise<boolean> {
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.BILLING_BYPASS_DEVELOPMENT === "true"
  ) {
    return true;
  }
  const subscription = await prisma.shopSubscription.findUnique({
    where: { shopId },
  });
  if (!subscription) return false;
  if (subscription.status === "ACTIVE") return true;
  return (
    subscription.status === "TRIAL" &&
    Boolean(subscription.trialEndsAt && subscription.trialEndsAt > now)
  );
}

export async function recordCompletedCallUsage(params: {
  shopId: string;
  supportCaseId: string;
  callAttemptId: string;
  completedAt: Date;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${params.shopId}))`;
    const existing = await tx.usageLedger.findUnique({
      where: { callAttemptId: params.callAttemptId },
    });
    if (existing) return existing;
    const subscription = await tx.shopSubscription.findUnique({
      where: { shopId: params.shopId },
    });
    const cycle =
      subscription?.currentCycleStart && subscription.currentCycleEnd
        ? {
            start: subscription.currentCycleStart,
            end: subscription.currentCycleEnd,
            trial: Boolean(
              subscription.trialEndsAt &&
              subscription.trialEndsAt > params.completedAt,
            ),
          }
        : currentCalendarCycle(params.completedAt);
    const alreadyCompleted = await tx.usageLedger.count({
      where: {
        shopId: params.shopId,
        usageType: "COMPLETED_CALL",
        reversedAt: null,
        occurredAt: { gte: cycle.start, lt: cycle.end },
      },
    });
    if (alreadyCompleted >= BILLING_PLAN.maximumCallsPerCycle) {
      throw new Error(
        "Monthly completed-call ceiling exceeded; billing ledger entry refused",
      );
    }
    const includedLimit = cycle.trial
      ? BILLING_PLAN.trialCalls
      : BILLING_PLAN.includedCalls;
    const included = alreadyCompleted < includedLimit;
    const idempotencyKey = `call_${sha256Hash(params.callAttemptId).slice(0, 48)}`;
    return tx.usageLedger.create({
      data: {
        shopId: params.shopId,
        supportCaseId: params.supportCaseId,
        callAttemptId: params.callAttemptId,
        usageType: "COMPLETED_CALL",
        quantity: 1,
        unit: "completed_call",
        estimatedCostMinor: included ? 0 : BILLING_PLAN.overageUnitPriceMinor,
        currencyCode: "USD",
        billingCycleStart: cycle.start,
        billingCycleEnd: cycle.end,
        included,
        eventHandle: included ? null : BILLING_PLAN.eventHandle,
        idempotencyKey,
        status: included ? "INCLUDED" : "PENDING",
        occurredAt: params.completedAt,
      },
    });
  });
}

async function getAppEventsAccessToken(): Promise<string> {
  if (appEventsToken && appEventsToken.expiresAt > Date.now() + 60_000)
    return appEventsToken.value;
  const clientId =
    process.env.SHOPIFY_APP_EVENTS_CLIENT_ID || process.env.SHOPIFY_API_KEY;
  const clientSecret =
    process.env.SHOPIFY_APP_EVENTS_CLIENT_SECRET ||
    process.env.SHOPIFY_API_SECRET;
  if (!clientId || !clientSecret)
    throw new Error("Shopify App Events client credentials are missing");

  const response = await fetch("https://api.shopify.com/auth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });
  if (!response.ok)
    throw new Error(
      `Shopify App Events authentication failed with HTTP ${response.status}`,
    );
  const body = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!body.access_token)
    throw new Error(
      "Shopify App Events authentication returned no access token",
    );
  appEventsToken = {
    value: body.access_token,
    expiresAt: Date.now() + Math.max(60, body.expires_in ?? 3599) * 1000,
  };
  return body.access_token;
}

export async function reportUsageLedgerEntry(ledgerId: string): Promise<void> {
  const ledger = await prisma.usageLedger.findUnique({
    where: { id: ledgerId },
  });
  if (
    !ledger ||
    ledger.included ||
    ["RECEIVED", "VALIDATED"].includes(ledger.status) ||
    ledger.reversedAt
  )
    return;
  const shop = await prisma.shopSettings.findUnique({
    where: { id: ledger.shopId },
  });
  if (!shop) throw new Error(`Shop ${ledger.shopId} no longer exists`);

  try {
    const token = await getAppEventsAccessToken();
    const apiVersion = process.env.SHOPIFY_APP_EVENTS_API_VERSION || "unstable";
    const response = await fetch(
      `https://api.shopify.com/app/${apiVersion}/events`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          shop_id: shop.shopifyShopId,
          event_handle: BILLING_PLAN.eventHandle,
          timestamp: ledger.occurredAt.toISOString(),
          idempotency_key: ledger.idempotencyKey,
          attributes: { value: ledger.quantity },
        }),
      },
    );
    if (response.status !== 202) {
      const retryable = response.status === 429 || response.status >= 500;
      throw Object.assign(
        new Error(`Shopify App Events returned HTTP ${response.status}`),
        { retryable },
      );
    }
    const body = (await response.json()) as {
      success?: boolean;
      error?: string;
    };
    if (body.success !== true) {
      throw Object.assign(
        new Error(
          body.error || "Shopify App Events did not acknowledge the event",
        ),
        { retryable: false },
      );
    }
    await prisma.usageLedger.update({
      where: { id: ledger.id },
      // A 202 confirms receipt only. Shopify performs billing validation
      // asynchronously and exposes failures in the App Billing Event logs.
      data: {
        status: "RECEIVED",
        reportedAt: new Date(),
        nextRetryAt: null,
        lastError: null,
      },
    });
  } catch (error) {
    const retryable = (error as { retryable?: boolean }).retryable !== false;
    const retryCount = ledger.retryCount + 1;
    const delayMinutes = Math.min(360, 2 ** Math.min(retryCount, 8));
    await prisma.usageLedger.update({
      where: { id: ledger.id },
      data: {
        status: retryable ? "RETRY" : "FAILED",
        retryCount,
        nextRetryAt: retryable
          ? new Date(Date.now() + delayMinutes * 60_000)
          : null,
        lastError:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Unknown billing error",
      },
    });
    throw error;
  }
}

export async function reportPendingUsage(limit = 50): Promise<number> {
  const entries = await prisma.usageLedger.findMany({
    where: {
      included: false,
      reversedAt: null,
      status: { in: ["PENDING", "RETRY"] },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
    },
    orderBy: { occurredAt: "asc" },
    take: limit,
  });
  let accepted = 0;
  for (const entry of entries) {
    await reportUsageLedgerEntry(entry.id)
      .then(() => accepted++)
      .catch(() => undefined);
  }
  return accepted;
}

export async function reverseUsageLedgerEntry(ledgerId: string): Promise<void> {
  const ledger = await prisma.usageLedger.findUnique({
    where: { id: ledgerId },
  });
  if (!ledger || ledger.reversedAt) return;
  const reversalIdempotencyKey = `reverse_${sha256Hash(ledger.idempotencyKey).slice(0, 47)}`;
  if (ledger.included) {
    await prisma.usageLedger.update({
      where: { id: ledger.id },
      data: {
        reversedAt: new Date(),
        reversalIdempotencyKey,
        reversalStatus: "NOT_REQUIRED",
      },
    });
    return;
  }
  if (ledger.status !== "VALIDATED") {
    await prisma.usageLedger.update({
      where: { id: ledger.id },
      data: {
        reversalIdempotencyKey,
        reversalStatus: "WAITING_FOR_ORIGINAL_VALIDATION",
      },
    });
    return;
  }
  const shop = await prisma.shopSettings.findUnique({
    where: { id: ledger.shopId },
  });
  if (!shop) throw new Error(`Shop ${ledger.shopId} no longer exists`);
  const token = await getAppEventsAccessToken();
  const apiVersion = process.env.SHOPIFY_APP_EVENTS_API_VERSION || "unstable";
  const response = await fetch(
    `https://api.shopify.com/app/${apiVersion}/events`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        shop_id: shop.shopifyShopId,
        event_handle: BILLING_PLAN.eventHandle,
        timestamp: new Date().toISOString(),
        idempotency_key: reversalIdempotencyKey,
        attributes: { value: -ledger.quantity },
      }),
    },
  );
  if (response.status !== 202) {
    await prisma.usageLedger.update({
      where: { id: ledger.id },
      data: {
        reversalIdempotencyKey,
        reversalStatus: "FAILED",
        lastError: `Reversal HTTP ${response.status}`,
      },
    });
    throw new Error(
      `Shopify App Events reversal returned HTTP ${response.status}`,
    );
  }
  const body = (await response.json()) as { success?: boolean; error?: string };
  if (body.success !== true) {
    await prisma.usageLedger.update({
      where: { id: ledger.id },
      data: {
        reversalIdempotencyKey,
        reversalStatus: "FAILED",
        lastError: body.error || "Shopify did not acknowledge the reversal",
      },
    });
    throw new Error(
      body.error || "Shopify App Events did not acknowledge the reversal",
    );
  }
  await prisma.usageLedger.update({
    where: { id: ledger.id },
    data: {
      reversalReceivedAt: new Date(),
      reversalIdempotencyKey,
      reversalStatus: "RECEIVED",
      lastError: null,
    },
  });
}

export async function confirmUsageValidation(params: {
  ledgerId: string;
  shopifyEventId: string;
}) {
  const ledger = await prisma.usageLedger.update({
    where: { id: params.ledgerId },
    data: {
      status: "VALIDATED",
      validatedAt: new Date(),
      shopifyEventId: params.shopifyEventId,
      lastError: null,
    },
  });
  if (ledger.reversalStatus === "WAITING_FOR_ORIGINAL_VALIDATION") {
    await reverseUsageLedgerEntry(ledger.id);
  }
  return ledger;
}

export async function confirmUsageReversalValidation(params: {
  ledgerId: string;
  shopifyEventId: string;
}) {
  const ledger = await prisma.usageLedger.findUniqueOrThrow({
    where: { id: params.ledgerId },
  });
  if (ledger.reversalStatus !== "RECEIVED") {
    throw new Error(
      "The reversal must be received by Shopify before validation can be confirmed",
    );
  }
  return prisma.usageLedger.update({
    where: { id: params.ledgerId },
    data: {
      reversalStatus: "VALIDATED",
      reversedAt: new Date(),
      shopifyReversalEventId: params.shopifyEventId,
      lastError: null,
    },
  });
}

export async function synchronizeSubscription(params: {
  shopId: string;
  shopifyShopId: string;
}) {
  const organizationId = process.env.SHOPIFY_PARTNER_ORG_ID;
  const accessToken = process.env.SHOPIFY_PARTNER_API_TOKEN;
  const appId = process.env.SHOPIFY_APP_GID;
  if (!organizationId || !accessToken || !appId) {
    throw new Error("Partner API billing configuration is incomplete");
  }
  const query = `query ActiveSubscription($appId: ID!, $shopId: ID!) {
    activeSubscription(appId: $appId, shopId: $shopId) {
      billingPeriod cancelAtEndOfCycle trialEndsAt
      currentBillingCycle { startTime endTime }
      items { handle }
    }
  }`;
  const response = await fetch(
    `https://partners.shopify.com/${encodeURIComponent(organizationId)}/api/2026-07/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query,
        variables: { appId, shopId: params.shopifyShopId },
      }),
    },
  );
  const body = (await response.json()) as {
    data?: {
      activeSubscription?: {
        billingPeriod?: string;
        cancelAtEndOfCycle?: boolean;
        trialEndsAt?: string | null;
        currentBillingCycle?: { startTime?: string; endTime?: string };
        items?: Array<{ handle?: string }>;
      } | null;
    };
    errors?: Array<{ message?: string }>;
  };
  if (!response.ok || body.errors?.length) {
    throw new Error(
      body.errors?.map((error) => error.message).join("; ") ||
        `Partner API returned HTTP ${response.status}`,
    );
  }
  const active = body.data?.activeSubscription;
  const now = new Date();
  return prisma.shopSubscription.upsert({
    where: { shopId: params.shopId },
    create: {
      shopId: params.shopId,
      shopifyShopId: params.shopifyShopId,
      planHandle: active?.items?.[0]?.handle ?? null,
      status: active
        ? active.trialEndsAt && new Date(active.trialEndsAt) > now
          ? "TRIAL"
          : "ACTIVE"
        : "MISSING",
      billingPeriod: active?.billingPeriod ?? null,
      trialEndsAt: active?.trialEndsAt ? new Date(active.trialEndsAt) : null,
      currentCycleStart: active?.currentBillingCycle?.startTime
        ? new Date(active.currentBillingCycle.startTime)
        : null,
      currentCycleEnd: active?.currentBillingCycle?.endTime
        ? new Date(active.currentBillingCycle.endTime)
        : null,
      cancelAtEndOfCycle: active?.cancelAtEndOfCycle ?? false,
      synchronizedAt: now,
    },
    update: {
      planHandle: active?.items?.[0]?.handle ?? null,
      status: active
        ? active.trialEndsAt && new Date(active.trialEndsAt) > now
          ? "TRIAL"
          : "ACTIVE"
        : "MISSING",
      billingPeriod: active?.billingPeriod ?? null,
      trialEndsAt: active?.trialEndsAt ? new Date(active.trialEndsAt) : null,
      currentCycleStart: active?.currentBillingCycle?.startTime
        ? new Date(active.currentBillingCycle.startTime)
        : null,
      currentCycleEnd: active?.currentBillingCycle?.endTime
        ? new Date(active.currentBillingCycle.endTime)
        : null,
      cancelAtEndOfCycle: active?.cancelAtEndOfCycle ?? false,
      synchronizedAt: now,
      synchronizationError: null,
    },
  });
}
