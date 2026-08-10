import prisma from "../app/db.server";
import { JOBS, enqueueJob, stopQueue } from "../app/queue.server";
import { validateRuntimeConfiguration } from "../app/services/config.server";

validateRuntimeConfiguration();
const slot = new Date().toISOString().slice(0, 16);
await Promise.all([
  enqueueJob(JOBS.CALL_RECONCILIATION, {}, `reconciliation:${slot}`),
  enqueueJob(JOBS.BILLING_REPORT, {}, `billing:${slot}`),
  enqueueJob(JOBS.SUBSCRIPTION_SYNC, {}, `subscriptions:${slot}`),
  enqueueJob(
    JOBS.RETENTION_SWEEP,
    {},
    `retention:${new Date().toISOString().slice(0, 10)}`,
  ),
]);
if (process.env.BETTER_STACK_HEARTBEAT_URL) {
  const response = await fetch(process.env.BETTER_STACK_HEARTBEAT_URL, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(`Maintenance heartbeat returned HTTP ${response.status}`);
}
await stopQueue();
await prisma.$disconnect();
