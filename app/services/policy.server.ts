import type {
  SupportPolicy,
  PolicyDecision,
  IssueType,
  PolicyMode,
  RiskLevel,
  ResolutionActionType,
  OrderSnapshot,
} from "../lib/types";
import { DEFAULT_POLICIES } from "../lib/types";
import { sha256Hash } from "../lib/crypto.server";
import prisma from "../db.server";

export function getDefaultPolicies(): SupportPolicy[] {
  return DEFAULT_POLICIES;
}

export async function getShopPolicies(
  shopId: string,
): Promise<SupportPolicy[]> {
  const stored = await prisma.supportPolicy.findMany({
    where: { shopId },
  });
  if (stored.length === 0) {
    return DEFAULT_POLICIES;
  }
  return stored.map((p) => {
    const conditions = JSON.parse(p.conditionsJson) as Partial<SupportPolicy>;
    return {
      ...conditions,
      issueType: p.issueType as IssueType,
      mode: p.mode as PolicyMode,
      enabled: p.enabled,
      requireVerifiedIdentity: conditions.requireVerifiedIdentity ?? true,
      customInstructions: p.customInstructions ?? undefined,
    };
  }) as SupportPolicy[];
}

export async function getPolicyForIssue(
  shopId: string,
  issueType: IssueType,
): Promise<SupportPolicy> {
  const stored = await prisma.supportPolicy.findUnique({
    where: { shopId_issueType: { shopId, issueType } },
  });
  if (stored) {
    const conditions = JSON.parse(stored.conditionsJson) as Partial<SupportPolicy>;
    return {
      ...conditions,
      issueType: stored.issueType as IssueType,
      mode: stored.mode as PolicyMode,
      enabled: stored.enabled,
      requireVerifiedIdentity: conditions.requireVerifiedIdentity ?? true,
      customInstructions: stored.customInstructions ?? undefined,
    } as SupportPolicy;
  }
  return (
    DEFAULT_POLICIES.find((p) => p.issueType === issueType) ??
    DEFAULT_POLICIES[DEFAULT_POLICIES.length - 1]
  );
}

export function evaluatePolicy(
  policy: SupportPolicy,
  orderSnapshot: OrderSnapshot,
  callResult: {
    identityVerified: boolean;
    schemaValid: boolean;
    completionConfidence: number;
    requestedAction: string;
    disposition: string;
    hasTranscriptContradiction: boolean;
  },
  // Per-shop, from ShopSettings.confidenceThreshold. Defaults to the schema
  // default rather than a looser hardcoded value.
  confidenceThreshold = 0.85,
): PolicyDecision {
  const reasons: string[] = [];
  const checks: string[] = [];
  const now = new Date().toISOString();
  const snapshotHash = sha256Hash(JSON.stringify(orderSnapshot));

  // Build check list
  checks.push("policy_exists");
  checks.push("policy_enabled");

  if (!policy.enabled) {
    reasons.push("Policy is disabled");
    return {
      eligible: false,
      mode: "DISABLED",
      riskLevel: "LOW",
      reasonCodes: ["POLICY_DISABLED"],
      humanReadableReasons: reasons,
      requiredChecks: checks,
      actionType: "ESCALATE" as ResolutionActionType,
      snapshotHash,
      evaluatedAt: now,
    };
  }

  checks.push("identity_verified");
  if (policy.requireVerifiedIdentity && !callResult.identityVerified) {
    reasons.push("Identity not verified");
    return {
      eligible: false,
      mode: "APPROVAL",
      riskLevel: "HIGH",
      reasonCodes: ["IDENTITY_NOT_VERIFIED"],
      humanReadableReasons: reasons,
      requiredChecks: checks,
      actionType: "ESCALATE" as ResolutionActionType,
      snapshotHash,
      evaluatedAt: now,
    };
  }

  checks.push("schema_valid");
  if (!callResult.schemaValid) {
    reasons.push("Call result schema validation failed");
    return {
      eligible: false,
      mode: "DISABLED",
      riskLevel: "CRITICAL",
      reasonCodes: ["SCHEMA_INVALID"],
      humanReadableReasons: reasons,
      requiredChecks: checks,
      actionType: "NONE" as ResolutionActionType,
      snapshotHash,
      evaluatedAt: now,
    };
  }

  checks.push("transcript_consistency");
  if (callResult.hasTranscriptContradiction) {
    reasons.push("Transcript contradicts structured result");
    return {
      eligible: false,
      mode: "APPROVAL",
      riskLevel: "HIGH",
      reasonCodes: ["TRANSCRIPT_CONTRADICTION"],
      humanReadableReasons: reasons,
      requiredChecks: checks,
      actionType: "ESCALATE" as ResolutionActionType,
      snapshotHash,
      evaluatedAt: now,
    };
  }

  checks.push("disposition_valid");
  if (callResult.disposition !== "completed") {
    reasons.push(`Call disposition is ${callResult.disposition}, not completed`);
    return {
      eligible: false,
      mode: "DISABLED",
      riskLevel: "LOW",
      reasonCodes: ["CALL_NOT_COMPLETED"],
      humanReadableReasons: reasons,
      requiredChecks: checks,
      actionType: "NONE" as ResolutionActionType,
      snapshotHash,
      evaluatedAt: now,
    };
  }

  checks.push("confidence_threshold");
  // Previously hardcoded to 0.7, which quietly overrode both
  // ShopSettings.confidenceThreshold and CALL_RESULT_CONFIDENCE_THRESHOLD.
  // The gate was looser than the merchant's configuration claimed.
  if (callResult.completionConfidence < confidenceThreshold) {
    reasons.push("Completion confidence too low");
    return {
      eligible: false,
      mode: "APPROVAL",
      riskLevel: "HIGH",
      reasonCodes: ["LOW_CONFIDENCE"],
      humanReadableReasons: reasons,
      requiredChecks: checks,
      actionType: "ESCALATE" as ResolutionActionType,
      snapshotHash,
      evaluatedAt: now,
    };
  }

  // Map policy mode to action
  let actionType: ResolutionActionType;
  let riskLevel: RiskLevel;

  switch (policy.issueType) {
    case "ORDER_STATUS":
    case "PRODUCT_HELP":
      actionType = "EXPLAIN_STATUS";
      riskLevel = "LOW";
      break;
    case "ADDRESS_CHANGE":
      actionType = "UPDATE_ADDRESS";
      riskLevel = "MEDIUM";
      break;
    case "CANCELLATION":
      actionType = "CANCEL_ORDER";
      riskLevel = "HIGH";
      break;
    case "RETURN":
      actionType = "CREATE_RETURN";
      riskLevel = "MEDIUM";
      break;
    case "DAMAGED_ITEM":
    case "WRONG_ITEM":
    case "MISSING_ITEM":
      actionType = "ESCALATE";
      riskLevel = "HIGH";
      break;
    case "CARRIER_TRACE":
      actionType = "ADD_NOTE";
      riskLevel = "LOW";
      break;
    case "STUCK_ORDER_OUTREACH":
      actionType = "ADD_NOTE";
      riskLevel = "MEDIUM";
      break;
    default:
      actionType = "ESCALATE";
      riskLevel = "MEDIUM";
  }

  // Check order-specific conditions
  if (policy.requireUnfulfilled && orderSnapshot.fulfillmentStatus !== "UNFULFILLED") {
    reasons.push("Order is not unfulfilled");
    return {
      eligible: false,
      mode: "APPROVAL",
      riskLevel: "MEDIUM",
      reasonCodes: ["ORDER_NOT_UNFULFILLED"],
      humanReadableReasons: reasons,
      requiredChecks: checks,
      actionType,
      snapshotHash,
      evaluatedAt: now,
    };
  }

  if (orderSnapshot.cancelledAt) {
    reasons.push("Order is canceled");
    return {
      eligible: false,
      mode: "DISABLED",
      riskLevel: "LOW",
      reasonCodes: ["ORDER_CANCELED"],
      humanReadableReasons: reasons,
      requiredChecks: checks,
      actionType: "NONE" as ResolutionActionType,
      snapshotHash,
      evaluatedAt: now,
    };
  }

  const isNonMutating = actionType === "EXPLAIN_STATUS" || actionType === "ESCALATE";
  const effectiveMode = policy.mode === "AUTOMATIC" && !isNonMutating
    ? "APPROVAL"
    : policy.mode;

  return {
    eligible: true,
    mode: effectiveMode,
    riskLevel,
    reasonCodes: effectiveMode !== policy.mode ? ["HUMAN_APPROVAL_REQUIRED"] : [],
    humanReadableReasons: [
      effectiveMode !== policy.mode
        ? "Policy passed; Shopify mutations require merchant approval"
        : "Policy evaluation passed",
    ],
    requiredChecks: checks,
    actionType,
    snapshotHash,
    evaluatedAt: now,
  };
}
