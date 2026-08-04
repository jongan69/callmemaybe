import prisma from "../db.server";
import type {
  IssueType,
  SupportCaseStatus,
  OrderSnapshot,
} from "../lib/types";
import {
  generatePublicReference,
  generateVerificationCode,
  hashVerificationCode,
  generateIdempotencyKey,
  sha256Hash,
  encrypt,
  decrypt,
  hashForMatching,
  lastFour,
} from "../lib/crypto.server";
import { getPhoneProvider } from "../providers/index.server";
import { getPolicyForIssue, evaluatePolicy } from "./policy.server";
import { createAuditEvent } from "./audit.server";
import { ErrorCodes, createError } from "../lib/errors.server";
import {
  buildTaskTemplate,
  buildCarrierTraceTask,
  buildStuckOrderOutreachTask,
  getResultSchema,
  validateCallResult,
} from "../lib/call-plan";
import type {
  CarrierCallContext,
  StuckOrderContext,
} from "../lib/call-plan";

export {
  buildTaskTemplate,
  buildCarrierTraceTask,
  buildStuckOrderOutreachTask,
  getResultSchema,
  validateCallResult,
};
export type { CarrierCallContext, StuckOrderContext };

// ─── Create Support Case ─────────────────────────────────────

export async function createSupportCase(params: {
  shopId: string;
  shopDomain: string;
  shopifyOrderId: string;
  shopifyOrderName: string;
  shopifyCustomerId: string;
  issueType: IssueType;
  customerPhone: string;
  customerName?: string;
  customerEmail?: string;
  orderSnapshot: OrderSnapshot;
  ipHash?: string;
  userAgent?: string;
}): Promise<{
  caseId: string;
  publicReference: string;
  verificationCode: string;
  expiresAt: string;
}> {
  // Check for duplicate open cases
  const existing = await prisma.supportCase.findFirst({
    where: {
      shopId: params.shopId,
      shopifyOrderId: params.shopifyOrderId,
      issueType: params.issueType,
      status: {
        notIn: ["RESOLVED", "CANCELED", "CLOSED", "FAILED", "CALL_NOT_COMPLETED"],
      },
    },
  });

  if (existing) {
    throw createError(
      ErrorCodes.DUPLICATE_CASE,
      `Open case already exists for this order and issue type`,
      `You already have an open support request for this issue. Please check your existing case ${existing.publicReference}.`,
      { retryable: false },
    );
  }

  // Rate limit checks
  const phoneHash = hashForMatching(params.customerPhone);
  const recentCases = await prisma.supportCase.count({
    where: {
      shopId: params.shopId,
      customerPhoneHash: phoneHash,
      requestedAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    },
  });

  // Per-shop setting. Previously hardcoded to 3, which silently ignored both
  // ShopSettings.maxCallsPerCustomerPerDay and the .env value of the same name.
  const shopSettings = await prisma.shopSettings.findUnique({
    where: { id: params.shopId },
    select: { maxCallsPerCustomerPerDay: true },
  });
  const maxPerDay = shopSettings?.maxCallsPerCustomerPerDay ?? 2;

  if (recentCases >= maxPerDay) {
    throw createError(
      ErrorCodes.RATE_LIMITED,
      `Phone has ${recentCases} cases in the last 24 hours`,
      `You've reached the maximum number of support calls for today. Please try again tomorrow.`,
      { retryable: false },
    );
  }

  const code = generateVerificationCode();
  const codeHash = hashVerificationCode(code);
  const publicRef = generatePublicReference();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  const supportCase = await prisma.supportCase.create({
    data: {
      publicReference: publicRef,
      shopId: params.shopId,
      shopifyOrderId: params.shopifyOrderId,
      shopifyOrderName: params.shopifyOrderName,
      shopifyCustomerId: params.shopifyCustomerId,
      issueType: params.issueType,
      status: "REQUESTED",
      customerNameEncrypted: params.customerName
        ? encrypt(params.customerName)
        : null,
      customerEmailEncrypted: params.customerEmail
        ? encrypt(params.customerEmail)
        : null,
      customerPhoneEncrypted: encrypt(params.customerPhone),
      customerPhoneHash: phoneHash,
      customerPhoneLastFour: lastFour(params.customerPhone),
      orderSnapshotJson: JSON.stringify(params.orderSnapshot),
      orderSnapshotHash: sha256Hash(JSON.stringify(params.orderSnapshot)),
      consent: {
        create: {
          consentTextVersion: "1.0",
          consentText:
            "I am requesting an automated AI support call about this order. I understand the call may be transcribed.",
          phoneHash,
          customerId: params.shopifyCustomerId,
          orderId: params.shopifyOrderId,
          ipHash: params.ipHash,
          userAgentSummary: params.userAgent,
        },
      },
      verificationChallenge: {
        create: {
          codeHash,
          expiresAt,
          maxAttempts: 2,
        },
      },
    },
  });

  await createAuditEvent({
    shopId: params.shopId,
    supportCaseId: supportCase.id,
    actorType: "customer",
    actorId: params.shopifyCustomerId,
    action: "case.created",
    resourceType: "support_case",
    resourceId: supportCase.id,
    metadata: {
      issueType: params.issueType,
      orderId: params.shopifyOrderId,
    },
  });

  return {
    caseId: supportCase.id,
    publicReference: publicRef,
    verificationCode: code,
    expiresAt: expiresAt.toISOString(),
  };
}

// ─── Build Call Plan ─────────────────────────────────────────

export async function buildCallPlan(params: {
  supportCaseId: string;
  shopId: string;
  storeName: string;
  agentName: string;
  issueType: IssueType;
  customerPhone: string;
  region: string;
  locale: string;
  verificationCode: string;
  orderSnapshot: OrderSnapshot;
  orderName?: string;
  // Present only for third-party legs. When set, this plan dials the carrier or
  // supplier instead of the customer phone stored on the case.
  carrier?: CarrierCallContext;
  // Present only for merchant-initiated outreach on a blocked order.
  stuckOrder?: StuckOrderContext;
  attemptNumber?: number;
}): Promise<{
  callPlanId: string;
  idempotencyKey: string;
  taskText: string;
  resultSchema: Record<string, unknown>;
  metadata: Record<string, unknown>;
}> {
  const policy = await getPolicyForIssue(params.shopId, params.issueType);
  const attemptNumber = params.attemptNumber ?? 1;
  const idempotencyKey = generateIdempotencyKey(
    params.shopId,
    params.supportCaseId,
    attemptNumber,
    1,
  );

  const taskText = buildTaskTextForIssue(params, policy.customInstructions ?? "");
  const resultSchema = getResultSchema(params.issueType);

  const metadata = {
    product: "callmemaybe",
    shop_id: params.shopId,
    case_id: params.supportCaseId,
    issue_type: params.issueType,
    call_plan_version: "1",
    environment: process.env.NODE_ENV || "development",
    // Carried on the plan so submitCall can dial with the right region/voice
    // without a second settings lookup, and echoed back by CALL-E for support.
    region: params.region,
    locale: params.locale,
    call_leg: params.carrier ? "third_party" : "customer",
  };

  const callPlan = await prisma.callPlan.create({
    data: {
      supportCaseId: params.supportCaseId,
      version: 1,
      taskTextEncrypted: encrypt(taskText),
      resultSchemaJson: JSON.stringify(resultSchema),
      metadataJson: JSON.stringify(metadata),
      idempotencyKey,
      // A third-party leg carries its own recipient. Customer legs leave these
      // null and fall back to the phone stored on the support case.
      recipientKind: params.carrier ? "THIRD_PARTY" : "CUSTOMER",
      recipientPhoneEncrypted: params.carrier
        ? encrypt(params.carrier.supportPhone)
        : null,
      recipientLabel: params.carrier?.carrierName ?? null,
    },
  });

  return {
    callPlanId: callPlan.id,
    idempotencyKey,
    taskText,
    resultSchema,
    metadata,
  };
}

// The three legs speak from genuinely different scripts: a carrier agent has no
// support code to give, and a customer who is not expecting the call needs to be
// told why it is happening before anything else. Dispatching here keeps that
// choice in one place.
function buildTaskTextForIssue(
  params: {
    agentName: string;
    storeName: string;
    issueType: IssueType;
    verificationCode: string;
    orderSnapshot: OrderSnapshot;
    orderName?: string;
    carrier?: CarrierCallContext;
    stuckOrder?: StuckOrderContext;
  },
  policyInstructions: string,
): string {
  if (params.issueType === "CARRIER_TRACE") {
    if (!params.carrier) {
      throw createError(
        ErrorCodes.CALL_PLAN_CONTEXT_MISSING,
        "CARRIER_TRACE call plan requires carrier context",
        "This store has not configured carrier contact details.",
        { retryable: false },
      );
    }
    return buildCarrierTraceTask({
      agentName: params.agentName,
      storeName: params.storeName,
      policyInstructions,
      ...params.carrier,
    });
  }

  if (params.issueType === "STUCK_ORDER_OUTREACH") {
    if (!params.stuckOrder) {
      throw createError(
        ErrorCodes.CALL_PLAN_CONTEXT_MISSING,
        "STUCK_ORDER_OUTREACH call plan requires stuck-order context",
        "We couldn't determine why this order is blocked.",
        { retryable: false },
      );
    }
    return buildStuckOrderOutreachTask({
      agentName: params.agentName,
      storeName: params.storeName,
      verificationCode: params.verificationCode,
      orderSnapshot: params.orderSnapshot,
      orderName: params.orderName ?? params.orderSnapshot.orderId,
      policyInstructions,
      ...params.stuckOrder,
    });
  }

  return buildTaskTemplate({
    agentName: params.agentName,
    storeName: params.storeName,
    issueType: params.issueType,
    verificationCode: params.verificationCode,
    orderSnapshot: params.orderSnapshot,
    policyInstructions,
  });
}

// ─── Submit Call ─────────────────────────────────────────────

export async function submitCall(params: {
  supportCaseId: string;
  callPlanId: string;
  shopId: string;
}): Promise<{
  callAttemptId: string;
  providerCallId: string;
  status: string;
}> {
  const supportCase = await prisma.supportCase.findUnique({
    where: { id: params.supportCaseId },
    include: {
      callPlans: {
        where: { id: params.callPlanId },
      },
      verificationChallenge: true,
    },
  });

  if (!supportCase) {
    throw createError(
      ErrorCodes.CASE_NOT_FOUND,
      `Case not found`,
      `Support case not found.`,
    );
  }

  const callPlan = supportCase.callPlans[0];
  if (!callPlan) {
    throw createError(
      ErrorCodes.CASE_NOT_FOUND,
      `Call plan not found`,
      `Call plan not found.`,
    );
  }

  // Verify code hasn't expired and is still valid
  const challenge = supportCase.verificationChallenge;
  if (challenge && new Date() > challenge.expiresAt) {
    throw createError(
      ErrorCodes.CALL_NOT_TERMINAL,
      `Verification code expired`,
      `Your verification code has expired. Please request a new support call.`,
    );
  }

  const provider = getPhoneProvider();

  const callAttempt = await prisma.callAttempt.create({
    data: {
      supportCaseId: params.supportCaseId,
      callPlanId: params.callPlanId,
      attemptNumber: 1,
      provider: process.env.CALL_PROVIDER || "fake",
      status: "PENDING",
    },
  });

  // Update case status
  await prisma.supportCase.update({
    where: { id: params.supportCaseId },
    data: { status: "CALL_SUBMITTED" },
  });

  try {
    // The phone number and the task text are encrypted at rest and only
    // decrypted here, at the moment of dialing, so plaintext never sits in the
    // database or in a log line.
    // Third-party legs carry their own recipient on the plan; customer legs use
    // the phone stored on the case.
    const encryptedRecipient =
      callPlan.recipientKind === "THIRD_PARTY"
        ? callPlan.recipientPhoneEncrypted
        : supportCase.customerPhoneEncrypted;

    if (!encryptedRecipient) {
      throw createError(
        ErrorCodes.PHONE_INVALID,
        `Call plan ${callPlan.id} has no ${callPlan.recipientKind} phone number`,
        `We don't have a phone number on file for this request.`,
        { retryable: false },
      );
    }

    const recipientPhone = decrypt(encryptedRecipient);
    const taskText = decrypt(callPlan.taskTextEncrypted);
    const planMetadata = JSON.parse(callPlan.metadataJson) as Record<
      string,
      unknown
    >;

    const result = await provider.createCall({
      recipientPhone,
      region: (planMetadata.region as string) ?? "US",
      locale: (planMetadata.locale as string) ?? "en-US",
      idempotencyKey: callPlan.idempotencyKey,
      taskText,
      resultSchema: JSON.parse(callPlan.resultSchemaJson),
      metadata: planMetadata,
      ...(buildWebhookUrl() ? { webhookUrl: buildWebhookUrl() } : {}),
    });

    // Update call attempt with provider info
    await prisma.callAttempt.update({
      where: { id: callAttempt.id },
      data: {
        providerCallId: result.providerCallId,
        status: "CALLING",
        startedAt: new Date(),
      },
    });

    await prisma.supportCase.update({
      where: { id: params.supportCaseId },
      data: { status: "CALLING" },
    });

    // In fake mode, immediately process the result
    if (process.env.CALL_PROVIDER !== "calle") {
      // Small delay to simulate call
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await processCallResult(callAttempt.id, params.supportCaseId, params.shopId);
    }

    return {
      callAttemptId: callAttempt.id,
      providerCallId: result.providerCallId,
      status: "CALLING",
    };
  } catch (error) {
    await prisma.callAttempt.update({
      where: { id: callAttempt.id },
      data: {
        status: "FAILED",
        errorCode: "CALL_CREATE_FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
    });

    throw error;
  }
}

// ─── Process Call Result ─────────────────────────────────────

export async function processCallResult(
  callAttemptId: string,
  supportCaseId: string,
  shopId: string,
): Promise<void> {
  const callAttempt = await prisma.callAttempt.findUnique({
    where: { id: callAttemptId },
    include: { callPlan: true },
  });

  if (!callAttempt || !callAttempt.providerCallId) return;

  const provider = getPhoneProvider();
  await prisma.supportCase.update({
    where: { id: supportCaseId },
    data: { status: "PROCESSING_RESULT" },
  });

  const normalizedCall = await provider.getCall(callAttempt.providerCallId);

  // Update call attempt
  await prisma.callAttempt.update({
    where: { id: callAttemptId },
    data: {
      status: normalizedCall.status,
      outcome: normalizedCall.outcome,
      taskCompleted: normalizedCall.taskCompleted,
      completionConfidenceScore: normalizedCall.completionConfidenceScore,
      completionConfidenceLabel: normalizedCall.completionConfidenceLabel,
      structuredResultJson: normalizedCall.structuredResult
        ? JSON.stringify(normalizedCall.structuredResult)
        : null,
      summary: normalizedCall.summary,
      transcriptEncrypted: normalizedCall.transcript
        ? encrypt(normalizedCall.transcript)
        : null,
      transcriptRedacted: normalizedCall.transcript ?? null,
      evidenceJson: normalizedCall.evidence
        ? JSON.stringify(normalizedCall.evidence)
        : null,
      completedAt: normalizedCall.completedAt
        ? new Date(normalizedCall.completedAt)
        : null,
    },
  });

  // Store events. CALL-E does not embed events in the call object, they come
  // from a separate paginated endpoint, so fetch them when absent. Event
  // history is best-effort telemetry: never fail result processing over it.
  let callEvents = normalizedCall.events;
  if (!callEvents || callEvents.length === 0) {
    callEvents = await provider
      .getEvents(callAttempt.providerCallId)
      .catch(() => []);
  }

  if (callEvents) {
    for (const event of callEvents) {
      await prisma.callEvent
        .create({
          data: {
            callAttemptId: callAttempt.id,
            providerEventId: event.providerEventId,
            eventType: event.eventType,
            eventTime: new Date(event.eventTime),
            sequence: event.sequence,
            sanitizedPayloadJson: JSON.stringify(event.payload),
            payloadHash: sha256Hash(JSON.stringify(event.payload)),
          },
        })
        .catch(() => {
          // Ignore duplicate events
        });
    }
  }

  // Load case for policy evaluation
  const supportCase = await prisma.supportCase.findUnique({
    where: { id: supportCaseId },
  });
  if (!supportCase || !supportCase.orderSnapshotJson) return;

  const orderSnapshot: OrderSnapshot = JSON.parse(supportCase.orderSnapshotJson);
  const structuredResult = normalizedCall.structuredResult ?? {};

  // Evaluate policy
  const policy = await getPolicyForIssue(shopId, supportCase.issueType as IssueType);
  const settings = await prisma.shopSettings.findUnique({
    where: { id: shopId },
    select: { confidenceThreshold: true },
  });
  const decision = evaluatePolicy(policy, orderSnapshot, {
    identityVerified:
      (structuredResult.identity_status as string) === "verified",
    schemaValid: validateCallResult(supportCase.issueType, structuredResult),
    completionConfidence: normalizedCall.completionConfidenceScore ?? 0,
    requestedAction: (structuredResult.requested_action as string) ?? "none",
    disposition: (structuredResult.disposition as string) ?? "unknown",
    hasTranscriptContradiction: false,
  }, settings?.confidenceThreshold ?? 0.85);

  // Create resolution proposal
  const proposal = await prisma.resolutionProposal.create({
    data: {
      supportCaseId,
      callAttemptId: callAttempt.id,
      actionType: decision.actionType,
      status: decision.eligible
        ? decision.mode === "AUTOMATIC"
          ? "APPROVED"
          : "PENDING"
        : "FAILED",
      riskLevel: decision.riskLevel,
      policyDecisionJson: JSON.stringify(decision),
      proposedInputJson: JSON.stringify(structuredResult),
      beforeStateJson: JSON.stringify(orderSnapshot),
      requiresApproval: decision.mode !== "AUTOMATIC" || !decision.eligible,
    },
  });

  // Update case status
  let newStatus: SupportCaseStatus;
  if (!decision.eligible) {
    newStatus = "NEEDS_HUMAN";
  } else if (decision.mode === "AUTOMATIC") {
    newStatus = "RESOLVED";
  } else if (decision.mode === "APPROVAL") {
    newStatus = "AWAITING_APPROVAL";
  } else {
    newStatus = "NEEDS_HUMAN";
  }

  await prisma.supportCase.update({
    where: { id: supportCaseId },
    data: {
      status: newStatus,
      resolutionMode: decision.mode,
      riskLevel: decision.riskLevel,
      resolvedAt: newStatus === "RESOLVED" ? new Date() : null,
    },
  });

  await createAuditEvent({
    shopId,
    supportCaseId,
    actorType: "system",
    action: `case.result_processed`,
    resourceType: "support_case",
    resourceId: supportCaseId,
    metadata: {
      decision: decision.mode,
      eligible: decision.eligible,
      actionType: decision.actionType,
      proposalId: proposal.id,
    },
  });
}

// ─── Helpers ─────────────────────────────────────────────────

// CALL-E posts terminal call events to this per-request URL. Deliveries are
// unsigned, so the unguessable token in the path is what authenticates them,
// alongside the canonical re-fetch the provider performs.
function buildWebhookUrl(): string | undefined {
  const appUrl = process.env.SHOPIFY_APP_URL;
  const token = process.env.CALLE_WEBHOOK_TOKEN;
  if (!appUrl || !token) return undefined;
  return `${appUrl.replace(/\/$/, "")}/webhooks/calle/${token}`;
}


// ─── Get Case ────────────────────────────────────────────────

export async function getSupportCase(publicReference: string) {
  const case_ = await prisma.supportCase.findUnique({
    where: { publicReference },
    include: {
      callAttempts: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { callEvents: true },
      },
      resolutionProposals: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!case_) return null;

  return {
    ...case_,
    customerPhoneLastFour: case_.customerPhoneLastFour,
    latestCallAttempt: case_.callAttempts[0] ?? null,
    latestProposal: case_.resolutionProposals[0] ?? null,
  };
}

export async function getCasesForShop(shopId: string, filters?: {
  status?: string;
  issueType?: string;
  limit?: number;
}) {
  const where: Record<string, unknown> = { shopId };
  if (filters?.status) where.status = filters.status;
  if (filters?.issueType) where.issueType = filters.issueType;

  return prisma.supportCase.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: filters?.limit ?? 50,
    include: {
      callAttempts: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}
