import { z } from "zod";
import prisma from "./db.server";
import { unauthenticated } from "./shopify.server";
import { JOBS, startQueue, stopQueue } from "./queue.server";
import { validateRuntimeConfiguration } from "./services/config.server";
import { submitCall, processCallResult } from "./services/support-case.server";
import {
  reportPendingUsage,
  synchronizeSubscription,
} from "./services/billing.server";
import { executeResolution } from "./services/resolution.server";
import {
  processPrivacyRequest,
  purgeExpiredPrivateData,
} from "./services/privacy.server";
import { initializeObservability } from "./services/observability.server";
import { logEvent } from "./services/logger.server";

const Identifiers = z
  .object({
    shopId: z.string().min(1),
    supportCaseId: z.string().min(1),
    callPlanId: z.string().min(1),
  })
  .strict();
const EmptyJobData = z.object({}).strict();

validateRuntimeConfiguration();
initializeObservability();
const boss = await startQueue();

async function runJob(
  name: string,
  jobId: string,
  shopId: string | undefined,
  handler: () => Promise<unknown>,
) {
  const startedAt = performance.now();
  logEvent("info", "job.started", { name, jobId, shopId });
  try {
    const result = await handler();
    logEvent("info", "job.completed", {
      name,
      jobId,
      shopId,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return result;
  } catch (error) {
    logEvent("error", "job.failed", {
      name,
      jobId,
      shopId,
      durationMs: Math.round(performance.now() - startedAt),
      errorType: error instanceof Error ? error.name : "UnknownError",
      errorCode:
        typeof error === "object" && error && "code" in error
          ? String(error.code).slice(0, 100)
          : undefined,
    });
    throw error;
  }
}

await boss.work(JOBS.CALL_PLACEMENT, { batchSize: 1 }, async ([job]) => {
  const data = Identifiers.parse(job.data);
  await runJob(JOBS.CALL_PLACEMENT, job.id, data.shopId, () =>
    submitCall(data),
  );
});

await boss.work(JOBS.CALL_RECONCILIATION, { batchSize: 1 }, async ([job]) =>
  runJob(JOBS.CALL_RECONCILIATION, job.id, undefined, async () => {
    EmptyJobData.parse(job.data);
    const attempts = await prisma.callAttempt.findMany({
      where: {
        providerCallId: { not: null },
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
      include: { supportCase: { select: { shopId: true } } },
      take: 100,
      orderBy: { updatedAt: "asc" },
    });
    for (const attempt of attempts) {
      await processCallResult(
        attempt.id,
        attempt.supportCaseId,
        attempt.supportCase.shopId,
      );
    }
  }),
);

await boss.work(JOBS.BILLING_REPORT, { batchSize: 1 }, async ([job]) =>
  runJob(JOBS.BILLING_REPORT, job.id, undefined, () => {
    EmptyJobData.parse(job.data);
    return reportPendingUsage(100);
  }),
);

await boss.work(JOBS.SUBSCRIPTION_SYNC, { batchSize: 1 }, async ([job]) =>
  runJob(JOBS.SUBSCRIPTION_SYNC, job.id, undefined, async () => {
    EmptyJobData.parse(job.data);
    const shops = await prisma.shopSettings.findMany({
      select: { id: true, shopifyShopId: true },
    });
    for (const shop of shops) {
      await synchronizeSubscription({
        shopId: shop.id,
        shopifyShopId: shop.shopifyShopId,
      });
    }
  }),
);

await boss.work(JOBS.RESOLUTION_EXECUTION, { batchSize: 1 }, async ([job]) => {
  const data = z
    .object({
      proposalId: z.string().min(1),
      shopId: z.string().min(1),
      actorId: z.string().min(1),
    })
    .strict()
    .parse(job.data);
  await runJob(JOBS.RESOLUTION_EXECUTION, job.id, data.shopId, async () => {
    const shop = await prisma.shopSettings.findUnique({
      where: { id: data.shopId },
      select: { shopDomain: true },
    });
    if (!shop) throw new Error("Resolution job shop was not found");
    const { admin } = await unauthenticated.admin(shop.shopDomain);
    return executeResolution({
      admin,
      proposalId: data.proposalId,
      shopId: data.shopId,
      actorId: data.actorId,
    });
  });
});

await boss.work(JOBS.PRIVACY_REQUEST, { batchSize: 1 }, async ([job]) => {
  const data = z
    .object({ requestId: z.string().min(1) })
    .strict()
    .parse(job.data);
  await runJob(JOBS.PRIVACY_REQUEST, job.id, undefined, () =>
    processPrivacyRequest(data.requestId),
  );
});

await boss.work(JOBS.RETENTION_SWEEP, { batchSize: 1 }, async ([job]) =>
  runJob(JOBS.RETENTION_SWEEP, job.id, undefined, async () => {
    EmptyJobData.parse(job.data);
    const shops = await prisma.shopSettings.findMany({
      select: { id: true, shopDomain: true },
    });
    for (const shop of shops) {
      await purgeExpiredPrivateData(shop.shopDomain, shop.id);
    }
  }),
);

logEvent("info", "worker.ready");

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    await stopQueue();
    await prisma.$disconnect();
    process.exit(0);
  });
}
