import prisma from "../db.server";

export async function loader() {
  const checks: Record<string, { status: "ok" | "error"; message?: string }> = {};

  // Database check
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: "ok" };
  } catch (error) {
    checks.database = {
      status: "error",
      message: error instanceof Error ? error.message : "Database check failed",
    };
  }

  // CALL-E check
  checks.calle = {
    status: "ok",
    message:
      process.env.CALL_PROVIDER === "fake"
        ? "Fake provider active"
        : "Provider configured",
  };

  const overall = Object.values(checks).every((c) => c.status === "ok")
    ? "healthy"
    : "degraded";

  return Response.json({
    status: overall,
    checks,
    timestamp: new Date().toISOString(),
  });
}
