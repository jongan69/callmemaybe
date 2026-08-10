import prisma from "../db.server";
import { validateRuntimeConfiguration } from "./config.server";

type HealthCheck = { status: "ok" | "error"; code?: string };

export async function readiness() {
  const checks: Record<string, HealthCheck> = {};
  try {
    validateRuntimeConfiguration();
    checks.configuration = { status: "ok" };
  } catch {
    checks.configuration = { status: "error", code: "CONFIGURATION_INVALID" };
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: "ok" };
  } catch {
    checks.database = { status: "error", code: "DATABASE_UNAVAILABLE" };
  }
  try {
    const migrationRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "_prisma_migrations"
      WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
    `;
    checks.migrations =
      migrationRows[0]?.count > 0n
        ? { status: "ok" }
        : { status: "error", code: "MIGRATIONS_NOT_APPLIED" };
  } catch {
    checks.migrations = {
      status: "error",
      code: "MIGRATION_STATE_UNAVAILABLE",
    };
  }
  try {
    const queueRows = await prisma.$queryRaw<Array<{ queue: string | null }>>`
      SELECT to_regclass('pgboss.job')::text AS queue
    `;
    checks.queue = queueRows[0]?.queue
      ? { status: "ok" }
      : { status: "error", code: "QUEUE_NOT_INITIALIZED" };
  } catch {
    checks.queue = { status: "error", code: "QUEUE_UNAVAILABLE" };
  }
  return {
    status: Object.values(checks).every((check) => check.status === "ok")
      ? "ready"
      : "not_ready",
    checks,
    timestamp: new Date().toISOString(),
  };
}
