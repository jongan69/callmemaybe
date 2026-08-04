import type {
  PhoneSupportProvider,
  CreateSupportCallInput,
  CreateSupportCallOutput,
  NormalizedCall,
  NormalizedCallEvent,
  NormalizedWebhookResult,
} from "../lib/types";

const FAKE_CALL_ID_PREFIX = "fake-call-";
let callCounter = 0;

function generateFakeCallId(): string {
  callCounter++;
  return `${FAKE_CALL_ID_PREFIX}${Date.now()}-${callCounter}`;
}

function generateFakeEventId(): string {
  return `fake-ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Fixture-based simulation ────────────────────────────────

type FixtureName =
  | "address-change-success"
  | "address-change-unconfirmed"
  | "order-status-success"
  | "cancellation-request"
  | "return-request"
  | "damaged-item"
  | "wrong-code"
  | "wrong-person"
  | "declined"
  | "voicemail"
  | "no-answer"
  | "low-confidence"
  | "completed-task-false"
  | "invalid-schema";

type FixtureTemplate = {
  disposition: string;
  identityStatus: string;
  requestedAction: string;
  delay: number;
  outcome: string;
  confidence: number;
  taskCompleted: boolean;
  additionalFields?: Record<string, unknown>;
};

const FIXTURES: Record<FixtureName, FixtureTemplate> = {
  "address-change-success": {
    disposition: "completed",
    identityStatus: "verified",
    requestedAction: "update_address",
    delay: 3000,
    outcome: "COMPLETED",
    confidence: 0.95,
    taskCompleted: true,
    additionalFields: {
      address_line_1: "123 Main St",
      address_line_2: "Apt 4B",
      city: "Portland",
      province_or_state: "OR",
      postal_code: "97201",
      country_code: "US",
      recipient_name: "Alex Johnson",
      phone: "+15551234567",
      address_read_back: "yes",
      address_confirmed: "yes",
    },
  },
  "address-change-unconfirmed": {
    disposition: "completed",
    identityStatus: "verified",
    requestedAction: "update_address",
    delay: 3000,
    outcome: "COMPLETED",
    confidence: 0.8,
    taskCompleted: true,
    additionalFields: {
      address_line_1: "123 Main St",
      city: "Portland",
      province_or_state: "OR",
      postal_code: "97201",
      country_code: "US",
      address_read_back: "no",
      address_confirmed: "no",
    },
  },
  "order-status-success": {
    disposition: "completed",
    identityStatus: "verified",
    requestedAction: "explain_status",
    delay: 2000,
    outcome: "COMPLETED",
    confidence: 0.98,
    taskCompleted: true,
  },
  "cancellation-request": {
    disposition: "completed",
    identityStatus: "verified",
    requestedAction: "cancel_order",
    delay: 3000,
    outcome: "COMPLETED",
    confidence: 0.92,
    taskCompleted: true,
  },
  "return-request": {
    disposition: "completed",
    identityStatus: "verified",
    requestedAction: "create_return",
    delay: 3000,
    outcome: "COMPLETED",
    confidence: 0.9,
    taskCompleted: true,
    additionalFields: {
      selected_item_keys: ["item_1"],
      return_reason: "wrong_size",
      item_condition: "unopened",
    },
  },
  "damaged-item": {
    disposition: "completed",
    identityStatus: "verified",
    requestedAction: "request_replacement",
    delay: 4000,
    outcome: "COMPLETED",
    confidence: 0.88,
    taskCompleted: true,
    additionalFields: {
      selected_item_keys: ["item_1"],
      item_condition: "damaged",
    },
  },
  "wrong-code": {
    disposition: "verification_failed",
    identityStatus: "incorrect_code",
    requestedAction: "none",
    delay: 1500,
    outcome: "VERIFICATION_FAILED",
    confidence: 0.99,
    taskCompleted: false,
  },
  "wrong-person": {
    disposition: "wrong_person",
    identityStatus: "wrong_person",
    requestedAction: "none",
    delay: 1000,
    outcome: "WRONG_PERSON",
    confidence: 0.99,
    taskCompleted: false,
  },
  declined: {
    disposition: "declined",
    identityStatus: "declined",
    requestedAction: "none",
    delay: 1000,
    outcome: "DECLINED",
    confidence: 0.99,
    taskCompleted: false,
  },
  voicemail: {
    disposition: "voicemail",
    identityStatus: "unknown",
    requestedAction: "none",
    delay: 500,
    outcome: "VOICEMAIL",
    confidence: 0,
    taskCompleted: false,
  },
  "no-answer": {
    disposition: "no_answer",
    identityStatus: "unknown",
    requestedAction: "none",
    delay: 500,
    outcome: "NO_ANSWER",
    confidence: 0,
    taskCompleted: false,
  },
  "low-confidence": {
    disposition: "completed",
    identityStatus: "verified",
    requestedAction: "update_address",
    delay: 3000,
    outcome: "COMPLETED",
    confidence: 0.5,
    taskCompleted: true,
    additionalFields: {
      address_line_1: "456 Oak Ave",
      city: "Seattle",
      province_or_state: "WA",
      postal_code: "98101",
      country_code: "US",
      address_read_back: "yes",
      address_confirmed: "yes",
    },
  },
  "completed-task-false": {
    disposition: "completed",
    identityStatus: "verified",
    requestedAction: "update_address",
    delay: 3000,
    outcome: "COMPLETED",
    confidence: 0.9,
    taskCompleted: false,
  },
  "invalid-schema": {
    disposition: "completed",
    identityStatus: "verified",
    requestedAction: "update_address",
    delay: 3000,
    outcome: "COMPLETED",
    confidence: 0.9,
    taskCompleted: true,
    additionalFields: {
      // Missing required fields intentionally
      address_line_1: "",
      city: "",
    },
  },
};

function selectFixture(input: CreateSupportCallInput): FixtureName {
  const task = input.taskText.toLowerCase();
  const meta = input.metadata as Record<string, string>;

  // Allow override via metadata for testing
  if (meta.fixture) {
    const name = meta.fixture as FixtureName;
    if (FIXTURES[name]) return name;
  }

  if (task.includes("address") || task.includes("change address"))
    return "address-change-success";
  if (task.includes("cancel")) return "cancellation-request";
  if (task.includes("return")) return "return-request";
  if (task.includes("damage")) return "damaged-item";
  if (task.includes("track") || task.includes("status"))
    return "order-status-success";

  return "order-status-success";
}

function buildStructuredResult(
  fixture: FixtureTemplate,
): Record<string, unknown> {
  const common = {
    disposition: fixture.disposition,
    identity_status: fixture.identityStatus,
    issue_type: "address_change",
    requested_action: fixture.requestedAction,
    customer_confirmation:
      fixture.disposition === "completed" ? "confirmed" : "not_applicable",
    needs_human: fixture.disposition === "completed" ? "no" : "yes",
    summary: `Fake simulated call result for ${fixture.disposition}`,
    risk_flags: fixture.confidence < 0.7 ? ["low_confidence"] : [],
  };

  return {
    ...common,
    ...(fixture.additionalFields ?? {}),
  };
}

// ─── Fake Provider Implementation ────────────────────────────

export class FakePhoneSupportProvider implements PhoneSupportProvider {
  private calls: Map<string, NormalizedCall> = new Map();
  private events: Map<string, NormalizedCallEvent[]> = new Map();
  private webhooksDelivered: Set<string> = new Set();

  async createCall(
    input: CreateSupportCallInput,
  ): Promise<CreateSupportCallOutput> {
    const callId = generateFakeCallId();
    const fixtureName = selectFixture(input);
    const fixture = FIXTURES[fixtureName];

    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Build event timeline
    const now = new Date();
    const callEvents: NormalizedCallEvent[] = [
      {
        providerEventId: generateFakeEventId(),
        eventType: "call.initiated",
        eventTime: now.toISOString(),
        sequence: 1,
        payload: { status: "initiated" },
      },
      {
        providerEventId: generateFakeEventId(),
        eventType: "call.ringing",
        eventTime: new Date(now.getTime() + 1000).toISOString(),
        sequence: 2,
        payload: { status: "ringing" },
      },
      {
        providerEventId: generateFakeEventId(),
        eventType: "call.answered",
        eventTime: new Date(now.getTime() + 2000).toISOString(),
        sequence: 3,
        payload: { status: "in_progress" },
      },
      {
        providerEventId: generateFakeEventId(),
        eventType: "call.completed",
        eventTime: new Date(
          now.getTime() + 2000 + fixture.delay,
        ).toISOString(),
        sequence: 4,
        payload: {
          status: "completed",
          outcome: fixture.outcome,
          task_completed: fixture.taskCompleted,
          completion_confidence: fixture.confidence,
        },
      },
    ];

    const structuredResult = buildStructuredResult(fixture);

    const normalizedCall: NormalizedCall = {
      providerCallId: callId,
      status: "COMPLETED",
      outcome:
        fixture.outcome === "COMPLETED" ? "ANSWERED" : "FAILED",
      taskCompleted: fixture.taskCompleted,
      recipientPhone: input.recipientPhone,
      completionConfidenceScore: fixture.confidence,
      completionConfidenceLabel:
        fixture.confidence >= 0.8
          ? "high"
          : fixture.confidence >= 0.6
            ? "medium"
            : "low",
      structuredResult,
      summary: `Simulated call: ${fixture.disposition}`,
      transcript: `[AI Agent]: Hi, this is an AI support assistant calling from the store. This call may be transcribed. Please tell me your six-digit support code.\n[Customer]: 123456\n[AI Agent]: Thank you, that's correct. I understand you'd like help with your order. Let me look into that for you.\n[AI Agent]: I've recorded your request. You can check your support case in your customer account. Goodbye!`,
      evidence: [
        {
          type: "identity_verification",
          result: fixture.identityStatus,
        },
        {
          type: "call_completion",
          result: fixture.disposition,
          confidence: fixture.confidence,
        },
      ],
      events: callEvents,
      startedAt: now.toISOString(),
      connectedAt: new Date(now.getTime() + 2000).toISOString(),
      completedAt: new Date(
        now.getTime() + 2000 + fixture.delay,
      ).toISOString(),
      createdAt: now.toISOString(),
      updatedAt: new Date(
        now.getTime() + 2000 + fixture.delay,
      ).toISOString(),
    };

    this.calls.set(callId, normalizedCall);
    this.events.set(callId, callEvents);

    return {
      providerCallId: callId,
      status: "INITIATED",
      createdAt: now.toISOString(),
    };
  }

  async getCall(callId: string): Promise<NormalizedCall> {
    const call = this.calls.get(callId);
    if (!call) {
      throw new Error(`Call ${callId} not found`);
    }
    return call;
  }

  async getEvents(callId: string): Promise<NormalizedCallEvent[]> {
    return this.events.get(callId) ?? [];
  }

  async normalizeWebhook(
    body: unknown,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by PhoneSupportProvider
    _headers: Headers,
  ): Promise<NormalizedWebhookResult> {
    const rawPayload = body as Record<string, unknown>;
    const callId =
      (rawPayload.call_id as string) ?? `fake-wb-${Date.now()}`;

    // Check for duplicate delivery
    const payloadKey = JSON.stringify(body);
    if (this.webhooksDelivered.has(payloadKey)) {
      // Return with a marker for duplicate detection
      const call = this.calls.get(callId);
      return {
        providerCallId: callId,
        normalizedCall: call ?? {
          providerCallId: callId,
          status: "UNKNOWN",
          outcome: "UNKNOWN",
          taskCompleted: false,
          recipientPhone: "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        rawPayload: body,
        signatureValid: true,
      };
    }

    this.webhooksDelivered.add(payloadKey);

    const call = this.calls.get(callId);
    return {
      providerCallId: callId,
      normalizedCall: call ?? {
        providerCallId: callId,
        status: "UNKNOWN",
        outcome: "UNKNOWN",
        taskCompleted: false,
        recipientPhone: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      rawPayload: body,
      signatureValid: true,
    };
  }

  // For testing: reset state
  reset(): void {
    this.calls.clear();
    this.events.clear();
    this.webhooksDelivered.clear();
    callCounter = 0;
  }
}

// Singleton for the app
let fakeProviderInstance: FakePhoneSupportProvider | null = null;

export function getFakeProvider(): FakePhoneSupportProvider {
  if (!fakeProviderInstance) {
    fakeProviderInstance = new FakePhoneSupportProvider();
  }
  return fakeProviderInstance;
}
