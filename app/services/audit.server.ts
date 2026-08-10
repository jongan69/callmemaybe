import prisma from "../db.server";
import { generateRequestId, hashForMatching } from "../lib/crypto.server";
import { logEvent, sanitizeTelemetry } from "./logger.server";

type AuditActorType = "system" | "merchant" | "customer" | "webhook";

export async function createAuditEvent(params: {
  shopId: string;
  supportCaseId?: string;
  actorType: AuditActorType;
  actorId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  beforeHash?: string;
  afterHash?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        shopId: params.shopId,
        supportCaseId: params.supportCaseId,
        actorType: params.actorType,
        actorId:
          params.actorType === "customer" && params.actorId
            ? hashForMatching(params.actorId)
            : params.actorId,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        requestId: generateRequestId(),
        beforeHash: params.beforeHash,
        afterHash: params.afterHash,
        metadataJson: params.metadata
          ? JSON.stringify(sanitizeTelemetry(params.metadata))
          : null,
      },
    });
  } catch (error) {
    logEvent("error", "audit.write_failed", {
      action: params.action,
      resourceType: params.resourceType,
      errorType: error instanceof Error ? error.name : "UnknownError",
      errorCode:
        typeof error === "object" && error && "code" in error
          ? String(error.code).slice(0, 100)
          : undefined,
    });
    throw error;
  }
}

export async function getAuditTrail(
  supportCaseId: string,
): Promise<Array<Record<string, unknown>>> {
  const events = await prisma.auditEvent.findMany({
    where: { supportCaseId },
    orderBy: { createdAt: "asc" },
  });
  return events.map((e) => ({
    id: e.id,
    actorType: e.actorType,
    actorId: e.actorId,
    action: e.action,
    resourceType: e.resourceType,
    resourceId: e.resourceId,
    requestId: e.requestId,
    beforeHash: e.beforeHash,
    afterHash: e.afterHash,
    metadata: e.metadataJson ? JSON.parse(e.metadataJson) : null,
    createdAt: e.createdAt.toISOString(),
  }));
}
