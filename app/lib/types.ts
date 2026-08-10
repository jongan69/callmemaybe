// ─── Domain Enums ───────────────────────────────────────────

export const IssueType = {
  ORDER_STATUS: "ORDER_STATUS",
  ADDRESS_CHANGE: "ADDRESS_CHANGE",
  CANCELLATION: "CANCELLATION",
  RETURN: "RETURN",
  DAMAGED_ITEM: "DAMAGED_ITEM",
  WRONG_ITEM: "WRONG_ITEM",
  MISSING_ITEM: "MISSING_ITEM",
  PRODUCT_HELP: "PRODUCT_HELP",
  // Third-party leg: call the carrier to open a package trace on an order the
  // carrier marked delivered but the customer never received. No customer
  // identity to verify, so this leg is never gated on it.
  CARRIER_TRACE: "CARRIER_TRACE",
  // Merchant-initiated leg: the order cannot ship and the customer has stopped
  // answering email. Phone is the escalation channel.
  STUCK_ORDER_OUTREACH: "STUCK_ORDER_OUTREACH",
  OTHER: "OTHER",
} as const;
export type IssueType = (typeof IssueType)[keyof typeof IssueType];

export const PolicyMode = {
  INFORMATIONAL: "INFORMATIONAL",
  AUTOMATIC: "AUTOMATIC",
  APPROVAL: "APPROVAL",
  DISABLED: "DISABLED",
} as const;
export type PolicyMode = (typeof PolicyMode)[keyof typeof PolicyMode];

export const SupportCaseStatus = {
  REQUESTED: "REQUESTED",
  PREPARING_CALL: "PREPARING_CALL",
  CALL_SUBMITTED: "CALL_SUBMITTED",
  CALLING: "CALLING",
  PROCESSING_RESULT: "PROCESSING_RESULT",
  AWAITING_APPROVAL: "AWAITING_APPROVAL",
  EXECUTING_RESOLUTION: "EXECUTING_RESOLUTION",
  RESOLVED: "RESOLVED",
  NEEDS_HUMAN: "NEEDS_HUMAN",
  CALL_NOT_COMPLETED: "CALL_NOT_COMPLETED",
  OUTCOME_UNKNOWN: "OUTCOME_UNKNOWN",
  CANCELED: "CANCELED",
  CLOSED: "CLOSED",
  FAILED: "FAILED",
} as const;
export type SupportCaseStatus =
  (typeof SupportCaseStatus)[keyof typeof SupportCaseStatus];

export const ResolutionActionType = {
  NONE: "NONE",
  EXPLAIN_STATUS: "EXPLAIN_STATUS",
  UPDATE_ADDRESS: "UPDATE_ADDRESS",
  CANCEL_ORDER: "CANCEL_ORDER",
  CREATE_RETURN: "CREATE_RETURN",
  CREATE_REFUND: "CREATE_REFUND",
  ADD_NOTE: "ADD_NOTE",
  ADD_TAG: "ADD_TAG",
  REQUEST_REPLACEMENT: "REQUEST_REPLACEMENT",
  SEND_UPLOAD_LINK: "SEND_UPLOAD_LINK",
  ESCALATE: "ESCALATE",
} as const;
export type ResolutionActionType =
  (typeof ResolutionActionType)[keyof typeof ResolutionActionType];

export const CallStatus = {
  PENDING: "PENDING",
  QUEUED: "QUEUED",
  INITIATED: "INITIATED",
  RINGING: "RINGING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  BUSY: "BUSY",
  FAILED: "FAILED",
  NO_ANSWER: "NO_ANSWER",
  CANCELED: "CANCELED",
  UNKNOWN: "UNKNOWN",
} as const;
export type CallStatus = (typeof CallStatus)[keyof typeof CallStatus];

export const CallOutcome = {
  ANSWERED: "ANSWERED",
  COMPLETED: "COMPLETED",
  DECLINED: "DECLINED",
  WRONG_PERSON: "WRONG_PERSON",
  VERIFICATION_FAILED: "VERIFICATION_FAILED",
  VOICEMAIL: "VOICEMAIL",
  NO_ANSWER: "NO_ANSWER",
  FAILED: "FAILED",
  CANCELED: "CANCELED",
  UNKNOWN: "UNKNOWN",
} as const;
export type CallOutcome = (typeof CallOutcome)[keyof typeof CallOutcome];

export const IdentityStatus = {
  VERIFIED: "verified",
  INCORRECT_CODE: "incorrect_code",
  CODE_UNAVAILABLE: "code_unavailable",
  WRONG_PERSON: "wrong_person",
  DECLINED: "declined",
  UNKNOWN: "unknown",
} as const;
export type IdentityStatus =
  (typeof IdentityStatus)[keyof typeof IdentityStatus];

export const RiskLevel = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
} as const;
export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

export const ResolutionStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  EXECUTING: "EXECUTING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELED: "CANCELED",
} as const;
export type ResolutionStatus =
  (typeof ResolutionStatus)[keyof typeof ResolutionStatus];

export const KnowledgeSourceType = {
  SHOP_POLICY: "SHOP_POLICY",
  FAQ: "FAQ",
  PRODUCT_HELP: "PRODUCT_HELP",
  CUSTOM: "CUSTOM",
} as const;
export type KnowledgeSourceType =
  (typeof KnowledgeSourceType)[keyof typeof KnowledgeSourceType];

// ─── Domain Types ────────────────────────────────────────────

export type SupportPolicy = {
  issueType: IssueType;
  mode: PolicyMode;
  enabled: boolean;
  maxOrderValueMinor?: number;
  requireVerifiedIdentity: boolean;
  requireUnfulfilled?: boolean;
  requireNoActiveFulfillment?: boolean;
  requireWithinHoursOfPurchase?: number;
  returnWindowDays?: number;
  finalSaleTags?: string[];
  excludedProductTags?: string[];
  excludedCountries?: string[];
  approvalThresholdMinor?: number;
  customInstructions?: string;
};

export type PolicyDecision = {
  eligible: boolean;
  mode: PolicyMode;
  riskLevel: RiskLevel;
  reasonCodes: string[];
  humanReadableReasons: string[];
  requiredChecks: string[];
  actionType: ResolutionActionType;
  snapshotHash: string;
  evaluatedAt: string;
};

export type OrderSnapshot = {
  orderId: string;
  updatedAt: string;
  financialStatus: string;
  fulfillmentStatus: string;
  cancelledAt: string | null;
  shippingAddressHash: string | null;
  fulfillmentHash: string;
  lineItemHash: string;
  totalMinor: number;
  currencyCode: string;
  capturedAt: string;
};

export type ActionReceipt = {
  success: boolean;
  actionType: ResolutionActionType;
  shopifyResourceId: string;
  idempotencyKey: string;
  attemptedAt: string;
  completedAt?: string;
  before: unknown;
  after?: unknown;
  userErrors: Array<{
    field?: string[];
    message: string;
    code?: string;
  }>;
  requestId: string;
};

export type ApplicationError = {
  code: string;
  message: string;
  userMessage: string;
  retryable: boolean;
  requestId: string;
  fieldErrors?: Record<string, string[]>;
  metadata?: Record<string, unknown>;
};

export type CallDisposition =
  | "completed"
  | "partial"
  | "declined"
  | "wrong_person"
  | "verification_failed"
  | "voicemail"
  | "no_answer"
  | "failed"
  | "unknown";

export type CustomerConfirmation =
  "confirmed" | "not_confirmed" | "unclear" | "not_applicable" | "unknown";

export type NeedsHuman = "yes" | "no" | "unknown";

export type RequestedAction =
  | "none"
  | "explain_status"
  | "update_address"
  | "cancel_order"
  | "create_return"
  | "request_refund"
  | "request_replacement"
  | "send_upload_link"
  | "human_escalation"
  | "unknown";

// ─── Common CALL-E Result ────────────────────────────────────

export type CommonCallResult = {
  disposition: CallDisposition;
  identity_status: IdentityStatus;
  issue_type: string;
  requested_action: RequestedAction;
  customer_confirmation: CustomerConfirmation;
  needs_human: NeedsHuman;
  summary: string;
  risk_flags: string[];
};

export type AddressChangeResult = CommonCallResult & {
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  province_or_state?: string;
  postal_code?: string;
  country_code?: string;
  recipient_name?: string;
  phone?: string;
  address_read_back?: "yes" | "no" | "unknown";
  address_confirmed?: "yes" | "no" | "unknown";
};

export type ReturnResult = CommonCallResult & {
  selected_item_keys?: string[];
  return_reason?: string;
  item_condition?: string;
};

// ─── Provider Interfaces ─────────────────────────────────────

export type CreateSupportCallInput = {
  recipientPhone: string;
  region: string;
  locale: string;
  idempotencyKey: string;
  taskText: string;
  resultSchema: Record<string, unknown>;
  metadata: Record<string, unknown>;
  webhookUrl?: string;
};

export type CreateSupportCallOutput = {
  providerCallId: string;
  status: CallStatus;
  createdAt: string;
  ambiguous?: boolean;
};

export type NormalizedCall = {
  providerCallId: string;
  status: CallStatus;
  outcome: CallOutcome;
  taskCompleted: boolean;
  recipientPhone: string;
  completionConfidenceScore?: number;
  completionConfidenceLabel?: string;
  structuredResult?: Record<string, unknown>;
  summary?: string;
  transcript?: string;
  // CALL-E returns short evidence strings; the fake provider emits structured
  // objects. Both are accepted and persisted as JSON.
  evidence?: Array<string | Record<string, unknown>>;
  events?: NormalizedCallEvent[];
  errorCode?: string;
  errorMessage?: string;
  startedAt?: string;
  connectedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type NormalizedCallEvent = {
  providerEventId: string;
  eventType: string;
  eventTime: string;
  sequence: number;
  payload: Record<string, unknown>;
};

export type NormalizedWebhookResult = {
  providerCallId: string;
  normalizedCall: NormalizedCall;
  rawPayload: unknown;
  signatureValid: boolean;
};

export interface PhoneSupportProvider {
  createCall(input: CreateSupportCallInput): Promise<CreateSupportCallOutput>;
  getCall(callId: string): Promise<NormalizedCall>;
  getEvents(callId: string): Promise<NormalizedCallEvent[]>;
  normalizeWebhook(
    body: unknown,
    headers: Headers,
  ): Promise<NormalizedWebhookResult>;
}

// ─── Default Policy Matrix ───────────────────────────────────

export const DEFAULT_POLICIES: SupportPolicy[] = [
  {
    issueType: "ORDER_STATUS",
    mode: "AUTOMATIC",
    enabled: true,
    requireVerifiedIdentity: true,
  },
  {
    issueType: "ADDRESS_CHANGE",
    mode: "APPROVAL",
    enabled: true,
    requireVerifiedIdentity: true,
    requireUnfulfilled: true,
    requireNoActiveFulfillment: true,
  },
  {
    issueType: "CANCELLATION",
    mode: "APPROVAL",
    enabled: true,
    requireVerifiedIdentity: true,
  },
  {
    issueType: "RETURN",
    mode: "APPROVAL",
    enabled: true,
    requireVerifiedIdentity: true,
    returnWindowDays: 30,
  },
  {
    issueType: "DAMAGED_ITEM",
    mode: "APPROVAL",
    enabled: true,
    requireVerifiedIdentity: true,
  },
  {
    issueType: "WRONG_ITEM",
    mode: "APPROVAL",
    enabled: true,
    requireVerifiedIdentity: true,
  },
  {
    issueType: "MISSING_ITEM",
    mode: "APPROVAL",
    enabled: true,
    requireVerifiedIdentity: true,
  },
  {
    issueType: "PRODUCT_HELP",
    mode: "AUTOMATIC",
    enabled: true,
    requireVerifiedIdentity: true,
  },
  {
    // Carrier calls have no customer on the line, so identity verification is
    // not applicable. The trace result still goes through approval before any
    // reship or refund is executed.
    issueType: "CARRIER_TRACE",
    mode: "APPROVAL",
    enabled: true,
    requireVerifiedIdentity: false,
  },
  {
    issueType: "STUCK_ORDER_OUTREACH",
    mode: "APPROVAL",
    enabled: true,
    requireVerifiedIdentity: true,
    requireUnfulfilled: true,
  },
  {
    issueType: "OTHER",
    mode: "APPROVAL",
    enabled: true,
    requireVerifiedIdentity: true,
  },
];
