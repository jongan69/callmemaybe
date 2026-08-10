import type { OrderSnapshot } from "./types";
import { localizedCallOpening } from "./regions";

// Context a third-party leg needs that the order snapshot does not carry.
export type CarrierCallContext = {
  carrierName: string;
  supportPhone: string;
  trackingNumber: string;
  shipDate: string;
  deliveryClaimDate: string;
  shipToSummary: string;
  merchantAccountNumber?: string;
};

// Context for merchant-initiated outreach on an order that cannot ship.
export type StuckOrderContext = {
  blockerDescription: string;
  emailAttempts: number;
};

// Pure call-plan construction: the task instruction CALL-E speaks from, and the
// JSON Schema it extracts the structured result into.
//
// These version-controlled templates are the sole v1 task-generation path.
// CALL-E is the only production AI processor of call content.

export function buildTaskTemplate(params: {
  agentName: string;
  storeName: string;
  locale?: string;
  issueType: string;
  verificationCode: string;
  orderSnapshot: OrderSnapshot;
  policyInstructions: string;
}): string {
  const localized = localizedCallOpening(
    params.locale ?? "en",
    params.storeName,
  );
  return `You are ${params.agentName}, an AI customer-support assistant calling on behalf of ${params.storeName}.

LANGUAGE AND REQUIRED OPENING (script version ${localized.version})
- Conduct the entire call in ${localized.languageName}.
- Begin with this reviewed disclosure without changing its meaning:
  "${localized.opening}"

SECURITY AND DISCLOSURE
- Open by identifying ${params.storeName} and why you are calling.
- Clearly state that you are an AI assistant.
- State that the call may be transcribed.
- Do not disclose order details before identity is confirmed.
- Ask for the six-digit support code shown in the customer's signed-in account.
- The expected support code is ${params.verificationCode}. Never say this code aloud or hint at it.
- Allow at most two attempts. If neither matches exactly, set identity_status to
  incorrect_code, disclose nothing about the order, and politely end the call.
- Do not ask for passwords, payment details, or any code other than this
  CallMeMaybe support code.

CASE PURPOSE
Issue type: ${params.issueType}

ORDER SNAPSHOT (only after verification)
Order: ${params.orderSnapshot.orderId}
Fulfillment: ${params.orderSnapshot.fulfillmentStatus}
Financial: ${params.orderSnapshot.financialStatus}

POLICY NOTES
${params.policyInstructions || "Standard support policies apply."}

CLOSING
1. Summarize the customer's request.
2. Read back any consequential details.
3. Ask the customer to confirm.
4. Return the required structured result.`;
}

// ─── Third-party leg: call the carrier ───────────────────────
//
// Nothing about the customer script transfers here. There is no support code to
// challenge, the other party is a contact-centre agent or an IVR menu, and the
// caller is the shipper of record rather than a customer. The instruction has to
// carry the account context up front because a carrier agent will ask for it
// before doing anything.

export function buildCarrierTraceTask(params: {
  agentName: string;
  storeName: string;
  locale?: string;
  carrierName: string;
  trackingNumber: string;
  shipDate: string;
  deliveryClaimDate: string;
  shipToSummary: string;
  merchantAccountNumber?: string;
  policyInstructions: string;
}): string {
  const localized = localizedCallOpening(
    params.locale ?? "en",
    params.storeName,
  );
  return `You are ${params.agentName}, calling ${params.carrierName} on behalf of ${params.storeName}, the shipper of record for this package.

LANGUAGE AND REQUIRED OPENING (script version ${localized.version})
- Conduct the entire call in ${localized.languageName}.
- Begin with this reviewed disclosure without changing its meaning:
  "${localized.opening}"

GOAL
Open a package trace (a lost-package investigation) for a shipment the carrier
has marked delivered but the recipient never received. Do not end the call
without either a trace reference number or a clear statement of why one cannot
be opened.

DISCLOSURE
- State that you are an AI assistant calling on behalf of ${params.storeName}.
- State that the call may be transcribed.
- Do not claim to be a human if asked directly.

REACHING A PERSON
- Expect an automated menu first. Listen to the full menu before choosing.
- Prefer options for "existing shipment", "tracking", "claims", or "lost package".
- If asked to speak or enter the tracking number, use: ${params.trackingNumber}
- If the menu offers a callback instead of holding, decline and continue holding.
- Hold music and silence are normal. Stay on the line and wait.

SHIPMENT DETAILS
Carrier: ${params.carrierName}
Tracking number: ${params.trackingNumber}
Shipped: ${params.shipDate}
Carrier says delivered: ${params.deliveryClaimDate}
Delivered to: ${params.shipToSummary}${
    params.merchantAccountNumber
      ? `\nShipper account number: ${params.merchantAccountNumber}`
      : ""
  }

WHAT TO SAY
1. You are calling about a package marked delivered that the recipient did not receive.
2. Give the tracking number.
3. Ask the agent to open a package trace or lost-package investigation.
4. Ask for the trace or case reference number and write it down.
5. Ask how long the trace takes and when you will hear back.
6. Ask whether the shipper needs to do anything else to progress the claim.

IF THE AGENT REFUSES
Ask why. Common reasons are that the claim window has closed, the trace must be
filed online, or only the account holder can file. Capture the exact reason
rather than arguing.

DO NOT
- Do not accept a resolution on the customer's behalf.
- Do not agree to a refund, reship, or claim payout amount.
- Do not give payment details.
- Do not give the recipient's phone number or email unless the agent asks for it
  to progress the trace.

POLICY NOTES
${params.policyInstructions || "Standard shipping-claim policies apply."}

CLOSING
Read the trace reference back to the agent to confirm you recorded it correctly,
then return the required structured result.`;
}

// ─── Merchant-initiated leg: the order is stuck ──────────────
//
// The customer is not at a screen and has already ignored email, which is the
// whole reason this is a phone call. The instruction leads with why the merchant
// is calling so the customer does not mistake it for a cold sales call.

export function buildStuckOrderOutreachTask(params: {
  agentName: string;
  storeName: string;
  locale?: string;
  verificationCode: string;
  orderSnapshot: OrderSnapshot;
  orderName: string;
  blockerDescription: string;
  emailAttempts: number;
  policyInstructions: string;
}): string {
  const localized = localizedCallOpening(
    params.locale ?? "en",
    params.storeName,
  );
  return `You are ${params.agentName}, an AI assistant calling on behalf of ${params.storeName} about an order that cannot ship.

LANGUAGE AND REQUIRED OPENING (script version ${localized.version})
- Conduct the entire call in ${localized.languageName}.
- Begin with this reviewed disclosure without changing its meaning:
  "${localized.opening}"

WHY THIS CALL IS HAPPENING
Order ${params.orderName} is blocked: ${params.blockerDescription}
${params.storeName} has emailed the customer ${params.emailAttempts} time(s) with no reply.
Without a decision from the customer, the merchant may need to review whether the order can proceed.
Lead with this. The customer is not expecting the call.

DISCLOSURE
- Open by identifying ${params.storeName} and the order number ${params.orderName}.
- Clearly state that you are an AI assistant.
- State that the call may be transcribed.
- If this is a bad time, offer to call back and end the call politely.

VERIFICATION
- Do not disclose order contents, address, or payment details before verification.
- Ask for the six-digit CallMeMaybe support code shown only in the customer's
  signed-in account. The expected code is ${params.verificationCode}. Never say,
  repeat, or hint at the expected code.
- Allow at most two attempts. If neither matches exactly, set identity_status to
  incorrect_code, disclose nothing about the order, and end the call politely.
- Do not ask for passwords, payment details, or any code other than this
  CallMeMaybe support code.

WHAT TO RESOLVE
${params.blockerDescription}
Order: ${params.orderName}
Fulfillment: ${params.orderSnapshot.fulfillmentStatus}
Financial: ${params.orderSnapshot.financialStatus}

DO NOT
- Do not take payment details over the phone.
- Do not offer a discount, refund, or credit that was not authorised below.
- Do not pressure the customer. If they want to cancel, record that and stop.

POLICY NOTES
${params.policyInstructions || "Standard support policies apply."}

CLOSING
1. Summarise what the customer decided.
2. Read back any address or substitution detail in full.
3. Ask the customer to confirm out loud.
4. Tell them what happens next and when.
5. Return the required structured result.`;
}

// CALL-E enforces `additionalProperties: false` strictly: any field the voice
// agent collects that is not declared here is rejected and the whole structured
// result comes back null. So issue-specific fields MUST be declared up front,
// and `description` is what steers the extraction model's enum choices.
export function getResultSchema(issueType: string): Record<string, unknown> {
  const common = {
    type: "object",
    additionalProperties: false,
    required: [
      "disposition",
      "identity_status",
      "issue_type",
      "requested_action",
      "customer_confirmation",
      "needs_human",
      "summary",
      "risk_flags",
    ],
    properties: {
      disposition: {
        type: "string",
        enum: [
          "completed",
          "partial",
          "declined",
          "wrong_person",
          "verification_failed",
          "voicemail",
          "no_answer",
          "failed",
          "unknown",
        ],
      },
      identity_status: {
        type: "string",
        enum: [
          "verified",
          "incorrect_code",
          "code_unavailable",
          "wrong_person",
          "declined",
          "unknown",
        ],
      },
      issue_type: { type: "string" },
      requested_action: {
        type: "string",
        enum: [
          "none",
          "explain_status",
          "update_address",
          "cancel_order",
          "create_return",
          "request_refund",
          "request_replacement",
          "send_upload_link",
          "human_escalation",
          "unknown",
        ],
      },
      customer_confirmation: {
        type: "string",
        enum: [
          "confirmed",
          "not_confirmed",
          "unclear",
          "not_applicable",
          "unknown",
        ],
      },
      needs_human: { type: "string", enum: ["yes", "no", "unknown"] },
      summary: { type: "string" },
      risk_flags: { type: "array", items: { type: "string" } },
    },
  };

  if (issueType === "ADDRESS_CHANGE") {
    return {
      ...common,
      properties: {
        ...common.properties,
        address_line_1: {
          type: "string",
          description:
            "Street address the customer wants the order shipped to. Empty string if not collected.",
        },
        address_line_2: {
          type: "string",
          description:
            "Apartment, suite, or unit. Empty string if the customer has none.",
        },
        city: { type: "string" },
        province_or_state: { type: "string" },
        postal_code: { type: "string" },
        country_code: {
          type: "string",
          description: "ISO 3166-1 alpha-2 country code, for example US.",
        },
        recipient_name: { type: "string" },
        address_read_back: {
          type: "string",
          enum: ["yes", "no", "unknown"],
          description:
            "Use yes only when the agent read the complete new address back to the customer aloud.",
        },
        address_confirmed: {
          type: "string",
          enum: ["yes", "no", "unknown"],
          description:
            "Use yes only when the customer explicitly confirmed the address after it was read back. Anything less is no or unknown.",
        },
      },
    };
  }

  if (issueType === "CARRIER_TRACE") {
    return {
      ...common,
      properties: {
        ...common.properties,
        reached_agent: {
          type: "string",
          enum: ["yes", "no", "unknown"],
          description:
            "Use yes only when a human carrier agent was reached. Use no when the call never escaped the automated menu, hold, or voicemail.",
        },
        trace_opened: {
          type: "string",
          enum: ["yes", "no", "already_open", "refused", "unknown"],
          description:
            "Use yes when the agent confirmed a new trace or investigation was created. Use already_open when one existed. Use refused when the agent declined and gave a reason.",
        },
        trace_reference: {
          type: "string",
          description:
            "Trace, case, or claim reference number the agent gave. Empty string if none was provided.",
        },
        carrier_disposition: {
          type: "string",
          enum: [
            "investigating",
            "delivered_confirmed",
            "misdelivered",
            "lost",
            "delayed",
            "claim_window_closed",
            "requires_online_filing",
            "unknown",
          ],
          description:
            "What the carrier said about the package. Use delivered_confirmed only when the agent asserted delivery was correct and declined to investigate further.",
        },
        promised_response_by: {
          type: "string",
          description:
            "Date or timeframe the carrier said they would respond by, in the agent's own words. Empty string if not given.",
        },
        carrier_agent_name: { type: "string" },
        refusal_reason: {
          type: "string",
          description:
            "Exact reason given if the carrier declined to open a trace. Empty string otherwise.",
        },
        hold_time_minutes: {
          type: "integer",
          description:
            "Approximate minutes spent on hold or in the phone menu before reaching an agent. 0 if unknown.",
        },
      },
    };
  }

  if (issueType === "STUCK_ORDER_OUTREACH") {
    return {
      ...common,
      properties: {
        ...common.properties,
        reached_customer: {
          type: "string",
          enum: ["yes", "no", "wrong_person", "voicemail", "unknown"],
          description:
            "Use yes only when the intended customer was on the line and verified.",
        },
        blocker_resolved: {
          type: "string",
          enum: ["yes", "no", "partially", "unknown"],
          description:
            "Use yes when the customer supplied everything needed to unblock the order.",
        },
        customer_decision: {
          type: "string",
          enum: [
            "provided_address",
            "accepted_substitution",
            "declined_substitution",
            "will_retry_payment",
            "cancel_order",
            "call_back_later",
            "no_decision",
            "unknown",
          ],
          description:
            "The single decision the customer actually made. Use no_decision when the call ended without one.",
        },
        address_line_1: { type: "string" },
        address_line_2: { type: "string" },
        city: { type: "string" },
        province_or_state: { type: "string" },
        postal_code: { type: "string" },
        country_code: {
          type: "string",
          description: "ISO 3166-1 alpha-2 country code, for example US.",
        },
        substitute_variant: {
          type: "string",
          description:
            "Substitute item the customer accepted. Empty string if not applicable.",
        },
        detail_read_back: {
          type: "string",
          enum: ["yes", "no", "unknown"],
          description:
            "Use yes only when the agent read the consequential detail back to the customer aloud.",
        },
        customer_confirmed_aloud: {
          type: "string",
          enum: ["yes", "no", "unknown"],
          description:
            "Use yes only when the customer explicitly confirmed after the read-back. Anything less is no or unknown.",
        },
        callback_requested_at: {
          type: "string",
          description:
            "When the customer asked to be called back, in their own words. Empty string if they did not.",
        },
      },
    };
  }

  if (issueType === "RETURN") {
    return {
      ...common,
      properties: {
        ...common.properties,
        selected_item_keys: {
          type: "array",
          items: { type: "string" },
          description:
            "Line item identifiers the customer wants to return, taken from the order snapshot in the task.",
        },
        return_reason: { type: "string" },
        item_condition: {
          type: "string",
          description:
            "Condition the customer described, for example unopened, opened, used, or damaged.",
        },
      },
    };
  }

  return common;
}

// Validation lives beside the schema on purpose. These two drifting apart is
// exactly how ADDRESS_CHANGE ended up requiring fields the schema never
// declared, which made every address call return a null structured result.
export function validateCallResult(
  issueType: string,
  result: Record<string, unknown>,
): boolean {
  if (!result || typeof result !== "object") return false;

  const requiredFields = [
    "disposition",
    "identity_status",
    "requested_action",
    "summary",
  ];

  for (const field of requiredFields) {
    if (!(field in result)) return false;
    const val = result[field];
    if (typeof val !== "string" || val.length === 0) return false;
  }

  // Address-specific validation
  if (issueType === "ADDRESS_CHANGE") {
    const reqResult = result.requested_action;
    if (reqResult === "update_address") {
      if (
        !result.address_line_1 ||
        (result.address_line_1 as string).length === 0
      )
        return false;
      if (!result.city || (result.city as string).length === 0) return false;
      if (result.address_confirmed !== "yes") return false;
    }
  }

  return true;
}
