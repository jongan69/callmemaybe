import prisma from "../db.server";
import type {
  CallOutcome,
  IssueType,
  SupportCaseStatus,
  OrderSnapshot,
} from "../lib/types";
import {
  generatePublicReference,
  generateVerificationCode,
  hashVerificationCode,
  generateIdempotencyKey,
  generateSecretToken,
  hashSecret,
  sha256Hash,
  encrypt,
  decrypt,
  hashForMatching,
  lastFour,
} from "../lib/crypto.server";
import {
  getPhoneProvider,
  getProviderMode,
  isFakeMode,
} from "../providers/index.server";
import { assertCallEligible } from "./call-eligibility.server";
import {
  BILLING_PLAN,
  getBillingCycle,
  recordCompletedCallUsage,
} from "./billing.server";
import { revokeCallConsent, suppressPhone } from "./consent.server";
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
import type { CarrierCallContext, StuckOrderContext } from "../lib/call-plan";

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
  consentId?: string;
  orderSnapshot: OrderSnapshot;
  ipHash?: string;
  userAgent?: string;
  requestedBy?: { type: "customer" | "merchant"; id: string };
}): Promise<{
  caseId: string;
  publicReference: string;
  verificationCode: string;
  expiresAt: string;
}> {
  if (params.issueType !== "CARRIER_TRACE" && !params.consentId) {
    throw createError(
      ErrorCodes.CONSENT_REQUIRED,
      "Customer call case creation requires an existing consent record",
      "The customer must consent to calls for this order before outreach can begin.",
    );
  }

  // Check for duplicate open cases
  const existing = await prisma.supportCase.findFirst({
    where: {
      shopId: params.shopId,
      consentId: params.consentId,
      shopifyOrderId: params.shopifyOrderId,
      issueType: params.issueType,
      status: {
        notIn: [
          "RESOLVED",
          "CANCELED",
          "CLOSED",
          "FAILED",
          "CALL_NOT_COMPLETED",
        ],
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
      consentId: params.consentId,
      shopifyOrderId: params.shopifyOrderId,
      shopifyOrderName: params.shopifyOrderName,
      shopifyCustomerId: params.shopifyCustomerId,
      issueType: params.issueType,
      status: "REQUESTED",
      requestExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      customerNameEncrypted: params.customerName
        ? encrypt(params.customerName)
        : null,
      customerPhoneEncrypted: encrypt(params.customerPhone),
      customerPhoneHash: phoneHash,
      customerPhoneLastFour: lastFour(params.customerPhone),
      orderSnapshotJson: JSON.stringify(params.orderSnapshot),
      orderSnapshotHash: sha256Hash(JSON.stringify(params.orderSnapshot)),
      ...(params.issueType !== "CARRIER_TRACE"
        ? {
            verificationChallenge: {
              create: {
                codeHash,
                codeEncrypted: encrypt(code),
                expiresAt,
                maxAttempts: 2,
              },
            },
          }
        : {}),
    },
  });

  await createAuditEvent({
    shopId: params.shopId,
    supportCaseId: supportCase.id,
    actorType: params.requestedBy?.type ?? "customer",
    actorId: params.requestedBy?.id ?? params.shopifyCustomerId,
    action: "case.created",
    resourceType: "support_case",
    resourceId: supportCase.id,
    metadata: {
      issueType: params.issueType,
    },
  });

  return {
    caseId: supportCase.id,
    publicReference: publicRef,
    verificationCode: params.issueType === "CARRIER_TRACE" ? "" : code,
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
  merchantApprovedBy?: string;
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

  const taskText = await buildTaskTextForIssue(
    params,
    policy.customInstructions ?? "",
  );
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
      approvedBy: params.carrier ? (params.merchantApprovedBy ?? null) : null,
      approvedAt:
        params.carrier && params.merchantApprovedBy ? new Date() : null,
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
//
async function buildTaskTextForIssue(
  params: {
    agentName: string;
    storeName: string;
    issueType: IssueType;
    locale: string;
    verificationCode: string;
    orderSnapshot: OrderSnapshot;
    orderName?: string;
    carrier?: CarrierCallContext;
    stuckOrder?: StuckOrderContext;
  },
  policyInstructions: string,
): Promise<string> {
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
      locale: params.locale,
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
      locale: params.locale,
      verificationCode: params.verificationCode,
      orderSnapshot: params.orderSnapshot,
      orderName: params.orderName ?? params.orderSnapshot.orderId,
      policyInstructions,
      ...params.stuckOrder,
    });
  }

  // Customer-initiated calls (ADDRESS_CHANGE, CANCELLATION, etc.).
  return buildTaskTemplate({
    agentName: params.agentName,
    storeName: params.storeName,
    locale: params.locale,
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

  if (!supportCase || supportCase.shopId !== params.shopId) {
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

  const existingAttempt = await prisma.callAttempt.findUnique({
    where: { callPlanId: callPlan.id },
  });
  if (existingAttempt?.providerCallId) {
    return {
      callAttemptId: existingAttempt.id,
      providerCallId: existingAttempt.providerCallId,
      status: existingAttempt.status,
    };
  }

  await assertCallEligible({
    shopId: params.shopId,
    supportCaseId: params.supportCaseId,
    callPlanId: params.callPlanId,
  });

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

  const callbackNonce = generateSecretToken();
  const cycle = await getBillingCycle(params.shopId);
  const callAttempt = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${params.shopId}))`;
    const [priorAttempts, activeCalls, completedCalls, lockedSettings] =
      await Promise.all([
        tx.callAttempt.count({
          where: {
            supportCaseId: params.supportCaseId,
            providerCallId: { not: null },
          },
        }),
        tx.callAttempt.count({
          where: {
            supportCase: { shopId: params.shopId },
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
        }),
        tx.usageLedger.count({
          where: {
            shopId: params.shopId,
            usageType: "COMPLETED_CALL",
            reversedAt: null,
            occurredAt: { gte: cycle.start, lt: cycle.end },
          },
        }),
        tx.shopSettings.findUnique({
          where: { id: params.shopId },
          select: { maxConcurrentCalls: true },
        }),
      ]);
    if (activeCalls >= (lockedSettings?.maxConcurrentCalls ?? 5)) {
      throw createError(
        ErrorCodes.RATE_LIMITED,
        "Shop call concurrency limit reached",
        "The call will remain queued until another call finishes.",
        { retryable: true },
      );
    }
    if (completedCalls + activeCalls >= BILLING_PLAN.maximumCallsPerCycle) {
      throw createError(
        ErrorCodes.POLICY_BLOCKED,
        "Monthly completed-call ceiling is fully reserved",
        "The monthly usage ceiling has been reached.",
      );
    }
    return tx.callAttempt.upsert({
      where: { callPlanId: params.callPlanId },
      create: {
        supportCaseId: params.supportCaseId,
        callPlanId: params.callPlanId,
        attemptNumber: priorAttempts + 1,
        provider: getProviderMode(),
        callbackNonceHash: hashSecret(callbackNonce),
        callbackExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: "PENDING",
      },
      update: {
        callbackNonceHash: hashSecret(callbackNonce),
        callbackExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: "PENDING",
        errorCode: null,
        errorMessage: null,
      },
    });
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
    await createAuditEvent({
      shopId: params.shopId,
      supportCaseId: params.supportCaseId,
      actorType: "system",
      action: "protected_data.decrypted_for_call",
      resourceType: "call_plan",
      resourceId: callPlan.id,
      metadata: {
        fields: ["recipient_phone", "call_task"],
        purpose: "authorized_call_placement",
      },
    });
    const planMetadata = JSON.parse(callPlan.metadataJson) as Record<
      string,
      unknown
    >;

    const webhookUrl = buildWebhookUrl(callAttempt.id, callbackNonce);
    const result = await provider.createCall({
      recipientPhone,
      region: (planMetadata.region as string) ?? "US",
      locale: (planMetadata.locale as string) ?? "en-US",
      idempotencyKey: callPlan.idempotencyKey,
      taskText,
      resultSchema: JSON.parse(callPlan.resultSchemaJson),
      metadata: planMetadata,
      ...(webhookUrl ? { webhookUrl } : {}),
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
    if (isFakeMode()) {
      // Small delay to simulate call
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await processCallResult(
        callAttempt.id,
        params.supportCaseId,
        params.shopId,
      );
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
        errorMessage: "The call provider could not place the call.",
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
    include: {
      callPlan: true,
      supportCase: { select: { shopId: true } },
    },
  });

  if (
    !callAttempt ||
    callAttempt.supportCaseId !== supportCaseId ||
    callAttempt.supportCase.shopId !== shopId ||
    !callAttempt.providerCallId ||
    callAttempt.resultProcessedAt
  )
    return;

  const provider = getPhoneProvider();
  await prisma.supportCase.update({
    where: { id: supportCaseId },
    data: { status: "PROCESSING_RESULT" },
  });

  const normalizedCall = await provider.getCall(callAttempt.providerCallId);
  const structuredResult = normalizedCall.structuredResult ?? {};
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
        ? encrypt(JSON.stringify(normalizedCall.structuredResult))
        : null,
      // Provider summaries are free-form and may repeat protected order data.
      // Persist only a controlled, non-PII outcome label; the approved
      // structured fields remain encrypted for the merchant review workflow.
      summary: safeOutcomeSummary(normalizedCall.outcome),
      evidenceJson: null,
      connectedAt: normalizedCall.connectedAt
        ? new Date(normalizedCall.connectedAt)
        : null,
      completedAt: normalizedCall.completedAt
        ? new Date(normalizedCall.completedAt)
        : null,
    },
  });

  const disposition = String(structuredResult.disposition ?? "").toLowerCase();
  const optedOut =
    structuredResult.opt_out === true ||
    ["stop_calling", "do_not_call", "opt_out"].includes(disposition);
  if (optedOut && normalizedCall.recipientPhone) {
    await suppressPhone({
      shopId,
      phone: normalizedCall.recipientPhone,
      reason: "spoken_opt_out",
      source: "call_result",
    });
    const supportCaseForConsent = await prisma.supportCase.findUnique({
      where: { id: supportCaseId },
      select: { shopifyOrderId: true, shopifyCustomerId: true },
    });
    if (supportCaseForConsent) {
      await revokeCallConsent({
        shopId,
        shopifyOrderId: supportCaseForConsent.shopifyOrderId,
        shopifyCustomerId: supportCaseForConsent.shopifyCustomerId,
        reason: "spoken_opt_out",
        suppressPhone: true,
      });
    }
  }

  const terminalStatuses = new Set([
    "COMPLETED",
    "FAILED",
    "CANCELED",
    "NO_ANSWER",
    "BUSY",
  ]);
  if (!terminalStatuses.has(normalizedCall.status)) {
    await prisma.supportCase.update({
      where: { id: supportCaseId },
      data: { status: "CALLING" },
    });
    return;
  }

  if (
    normalizedCall.status !== "COMPLETED" ||
    normalizedCall.outcome !== "COMPLETED"
  ) {
    await prisma.supportCase.update({
      where: { id: supportCaseId },
      data: { status: "CALL_NOT_COMPLETED" },
    });
    await createAuditEvent({
      shopId,
      supportCaseId,
      actorType: "system",
      action: "case.call_not_completed",
      resourceType: "call_attempt",
      resourceId: callAttemptId,
      metadata: {
        status: normalizedCall.status,
        outcome: normalizedCall.outcome,
      },
    });
    await prisma.callAttempt.update({
      where: { id: callAttemptId },
      data: { resultProcessedAt: new Date() },
    });
    return;
  }

  if (!normalizedCall.completedAt) {
    await prisma.supportCase.update({
      where: { id: supportCaseId },
      data: { status: "NEEDS_HUMAN" },
    });
    await createAuditEvent({
      shopId,
      supportCaseId,
      actorType: "system",
      action: "case.completed_call_missing_terminal_time",
      resourceType: "call_attempt",
      resourceId: callAttemptId,
    });
    await prisma.callAttempt.update({
      where: { id: callAttemptId },
      data: {
        outcome: "UNKNOWN",
        errorCode: "PROVIDER_TERMINAL_TIME_MISSING",
        resultProcessedAt: new Date(),
      },
    });
    return;
  }

  await recordCompletedCallUsage({
    shopId,
    supportCaseId,
    callAttemptId,
    completedAt: new Date(normalizedCall.completedAt),
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
            sanitizedPayloadJson: JSON.stringify({
              level: event.payload.level,
              status: event.payload.status,
            }),
            payloadHash: hashForMatching(JSON.stringify(event.payload)),
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

  const identityVerified = await consumeVerificationOutcome({
    callAttemptId,
    supportCaseId,
    recipientKind: callAttempt.callPlan.recipientKind,
    identityStatus: String(structuredResult.identity_status ?? "unknown"),
  });

  const orderSnapshot: OrderSnapshot = JSON.parse(
    supportCase.orderSnapshotJson,
  );
  // Evaluate policy
  const policy = await getPolicyForIssue(
    shopId,
    supportCase.issueType as IssueType,
  );
  const settings = await prisma.shopSettings.findUnique({
    where: { id: shopId },
    select: { confidenceThreshold: true },
  });
  const decision = evaluatePolicy(
    policy,
    orderSnapshot,
    {
      identityVerified,
      schemaValid: validateCallResult(supportCase.issueType, structuredResult),
      completionConfidence: normalizedCall.completionConfidenceScore ?? 0,
      requestedAction: (structuredResult.requested_action as string) ?? "none",
      disposition: (structuredResult.disposition as string) ?? "unknown",
      hasTranscriptContradiction: false,
    },
    settings?.confidenceThreshold ?? 0.85,
  );

  // Create resolution proposal
  const proposal = await prisma.resolutionProposal.upsert({
    where: { callAttemptId: callAttempt.id },
    create: {
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
      proposedInputJson: encrypt(JSON.stringify(structuredResult)),
      beforeStateJson: JSON.stringify(orderSnapshot),
      requiresApproval: decision.mode !== "AUTOMATIC" || !decision.eligible,
    },
    update: {},
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
  await prisma.callAttempt.update({
    where: { id: callAttemptId },
    data: { resultProcessedAt: new Date() },
  });
}

function safeOutcomeSummary(outcome: CallOutcome): string {
  switch (outcome) {
    case "COMPLETED":
      return "Call completed; review the structured result.";
    case "ANSWERED":
      return "Call answered but the requested task was not fully completed.";
    case "DECLINED":
      return "The recipient declined the requested call workflow.";
    case "WRONG_PERSON":
      return "The call reached the wrong person.";
    case "VERIFICATION_FAILED":
      return "Identity verification was not completed.";
    case "VOICEMAIL":
      return "The call reached voicemail.";
    case "NO_ANSWER":
      return "The call was not answered.";
    case "FAILED":
      return "The provider could not complete the call.";
    default:
      return "The call outcome is pending reconciliation.";
  }
}

// ─── Helpers ─────────────────────────────────────────────────

async function consumeVerificationOutcome(params: {
  callAttemptId: string;
  supportCaseId: string;
  recipientKind: string;
  identityStatus: string;
}): Promise<boolean> {
  if (params.recipientKind === "THIRD_PARTY") return true;
  return prisma.$transaction(async (tx) => {
    const challenge = await tx.verificationChallenge.findUnique({
      where: { supportCaseId: params.supportCaseId },
    });
    if (!challenge) return false;
    if (challenge.verifiedCallAttemptId === params.callAttemptId) return true;
    const now = new Date();
    if (
      challenge.expiresAt <= now ||
      challenge.invalidatedAt ||
      challenge.verifiedAt
    )
      return false;
    if (params.identityStatus === "verified") {
      const consumed = await tx.verificationChallenge.updateMany({
        where: {
          id: challenge.id,
          verifiedAt: null,
          invalidatedAt: null,
          expiresAt: { gt: now },
        },
        data: { verifiedAt: now, verifiedCallAttemptId: params.callAttemptId },
      });
      return consumed.count === 1;
    }
    if (
      ["incorrect_code", "verification_failed"].includes(params.identityStatus)
    ) {
      const attemptsUsed = challenge.attemptsUsed + 1;
      await tx.verificationChallenge.update({
        where: { id: challenge.id },
        data: {
          attemptsUsed,
          invalidatedAt: attemptsUsed >= challenge.maxAttempts ? now : null,
        },
      });
    }
    return false;
  });
}

// CALL-E posts terminal call events to this per-request URL. Deliveries are
// unsigned, so the unguessable token in the path is what authenticates them,
// alongside the canonical re-fetch the provider performs.
function buildWebhookUrl(
  callAttemptId: string,
  nonce: string,
): string | undefined {
  const appUrl = process.env.SHOPIFY_APP_URL;
  const token = process.env.CALLE_WEBHOOK_TOKEN;
  if (!appUrl || !token) {
    if (getProviderMode() === "calle") {
      throw new Error(
        "Live CALL-E calls require SHOPIFY_APP_URL and CALLE_WEBHOOK_TOKEN",
      );
    }
    return undefined;
  }
  const url = new URL(`${appUrl.replace(/\/$/, "")}/webhooks/calle/${token}`);
  url.searchParams.set("attempt", callAttemptId);
  url.searchParams.set("nonce", nonce);
  return url.toString();
}

// ─── Get Case ────────────────────────────────────────────────

export async function getSupportCase(
  publicReference: string,
  scope?: { shopId?: string; customerId?: string },
) {
  const case_ = await prisma.supportCase.findFirst({
    where: {
      publicReference,
      ...(scope?.shopId ? { shopId: scope.shopId } : {}),
      ...(scope?.customerId ? { shopifyCustomerId: scope.customerId } : {}),
    },
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
      verificationChallenge: true,
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

export async function getCasesForShop(
  shopId: string,
  filters?: {
    status?: string;
    issueType?: string;
    limit?: number;
  },
) {
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
