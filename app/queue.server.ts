import { PgBoss } from "pg-boss";
import { logEvent } from "./services/logger.server";

export const JOBS = {
  CALL_PLACEMENT: "call-placement",
  CALL_RECONCILIATION: "call-reconciliation",
  BILLING_REPORT: "billing-report",
  SUBSCRIPTION_SYNC: "subscription-sync",
  RESOLUTION_EXECUTION: "resolution-execution",
  PRIVACY_REQUEST: "privacy-request",
  RETENTION_SWEEP: "retention-sweep",
  DEAD_LETTER: "callmemaybe-dead-letter",
} as const;

let queuePromise: Promise<PgBoss> | null = null;

export function startQueue(): Promise<PgBoss> {
  if (!queuePromise) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl?.startsWith("postgres")) {
      throw new Error("The job queue requires a PostgreSQL DATABASE_URL.");
    }
    queuePromise = (async () => {
      const boss = new PgBoss({
        connectionString: databaseUrl,
        application_name: "callmemaybe-worker",
        schema: "pgboss",
        warningQueueSize: 500,
      });
      boss.on("error", (error) => {
        logEvent("error", "queue.error", {
          errorType: error.name,
          errorCode:
            "code" in error ? String(error.code).slice(0, 100) : undefined,
        });
      });
      await boss.start();
      await boss.createQueue(JOBS.DEAD_LETTER, {
        deleteAfterSeconds: 30 * 24 * 60 * 60,
      });
      for (const name of Object.values(JOBS).filter(
        (name) => name !== JOBS.DEAD_LETTER,
      )) {
        await boss.createQueue(name, {
          deadLetter: JOBS.DEAD_LETTER,
          retryLimit: 5,
          retryDelay: 30,
          retryBackoff: true,
          retryDelayMax: 3600,
          expireInSeconds: 15 * 60,
        });
      }
      return boss;
    })().catch((error) => {
      queuePromise = null;
      throw error;
    });
  }
  return queuePromise;
}

export async function enqueueJob(
  name: (typeof JOBS)[keyof typeof JOBS],
  data: Record<string, unknown>,
  idempotencyKey: string,
) {
  const boss = await startQueue();
  const id = await boss.send(name, data, {
    singletonKey: idempotencyKey,
    singletonSeconds: 365 * 24 * 60 * 60,
    deadLetter: JOBS.DEAD_LETTER,
    retryLimit: 5,
    retryDelay: 30,
    retryBackoff: true,
    retryDelayMax: 3600,
  });
  return id;
}

export async function stopQueue() {
  if (!queuePromise) return;
  const boss = await queuePromise;
  await boss.stop({ graceful: true, timeout: 30_000 });
  queuePromise = null;
}
