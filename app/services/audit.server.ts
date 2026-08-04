import prisma from "../db.server";
import { generateRequestId } from "../lib/crypto.server";

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
        actorId: params.actorId,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        requestId: generateRequestId(),
        beforeHash: params.beforeHash,
        afterHash: params.afterHash,
        metadataJson: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });
  } catch (error) {
    console.error("[Audit] Failed to create audit event:", error);
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
