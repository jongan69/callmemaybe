import {
  CalleClient,
  CalleAPIError,
  type Call,
  type CallRecipient,
} from "@call-e/calle";
import type {
  PhoneSupportProvider,
  CreateSupportCallInput,
  CreateSupportCallOutput,
  NormalizedCall,
  NormalizedCallEvent,
  NormalizedWebhookResult,
  CallStatus,
  CallOutcome,
} from "../lib/types";

// Real CALL-E provider, built on the official @call-e/calle TypeScript server SDK.
//
// Contract reference: https://docs.heycall-e.com/api-reference/calls
//   POST /v1/calls             -> CallTask
//   GET  /v1/calls/{id}        -> CallTask
//   GET  /v1/calls/{id}/events -> EventList (cursor paginated)
//   POST <webhook_url>         -> WebhookEvent { id, type, created_at, data: CallTask }
//
// CALL-E webhook deliveries are NOT signed (client.webhooks.verify is deprecated
// upstream), so authenticity here comes from two independent controls:
//   1. an unguessable per-install token in the callback URL path, and
//   2. re-fetching the canonical call from the API before we trust any payload.

const CALLE_API_KEY = process.env.CALLE_API_KEY || "";
const CALLE_BASE_URL = process.env.CALLE_BASE_URL || undefined;
const OFFICIAL_CALLE_ORIGIN = "https://api.heycall-e.com";

export class CallePhoneSupportProvider implements PhoneSupportProvider {
  private client: CalleClient;

  constructor(
    apiKey?: string,
    baseUrl?: string,
    // The SDK accepts an injected fetch. Tests use it to assert the outgoing
    // request against the published contract and to drive normalization from
    // spec-shaped responses without touching the network.
    fetchImpl?: (input: Request) => Promise<Response>,
  ) {
    const key = apiKey || CALLE_API_KEY;
    if (!key) {
      throw new Error(
        "CALLE_API_KEY is required for the real CALL-E provider. Set it in .env or pass it to the constructor.",
      );
    }
    const resolvedBaseUrl = resolveCalleBaseUrl(baseUrl || CALLE_BASE_URL);
    this.client = new CalleClient({
      apiKey: key,
      baseUrl: resolvedBaseUrl,
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
    });
  }

  async createCall(
    input: CreateSupportCallInput,
  ): Promise<CreateSupportCallOutput> {
    try {
      const call = await this.client.calls.create(
        {
          task: input.taskText,
          recipients: [
            {
              phones: [input.recipientPhone],
              region: input.region,
              locale: input.locale,
            },
          ],
          resultSchema: input.resultSchema,
          metadata: input.metadata,
          ...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {}),
        },
        { idempotencyKey: input.idempotencyKey },
      );

      return {
        providerCallId: call.id,
        status: mapCalleStatus(call.status),
        createdAt: call.createdAt,
      };
    } catch (error) {
      throw wrapCalleError(error, "create call");
    }
  }

  async getCall(callId: string): Promise<NormalizedCall> {
    try {
      const call = await this.client.calls.get(callId);
      return normalizeCalleCall(call);
    } catch (error) {
      throw wrapCalleError(error, `get call ${callId}`);
    }
  }

  async getEvents(callId: string): Promise<NormalizedCallEvent[]> {
    try {
      const events: NormalizedCallEvent[] = [];
      let cursor: string | undefined;

      // The events endpoint is cursor paginated and returns oldest -> newest.
      // CALL-E does not expose a sequence number, so we derive a stable one
      // from arrival order across pages.
      do {
        const page = await this.client.calls.listEvents(callId, {
          limit: 100,
          ...(cursor ? { cursor } : {}),
        });

        for (const event of page.data) {
          events.push({
            providerEventId: event.id,
            eventType: event.type,
            eventTime: event.created_at,
            sequence: events.length + 1,
            payload: {
              level: event.level,
              status: event.status,
              message: event.message,
              details: event.details,
            },
          });
        }

        cursor = page.nextCursor ?? undefined;
      } while (cursor);

      return events;
    } catch (error) {
      throw wrapCalleError(error, `list events for ${callId}`);
    }
  }

  async normalizeWebhook(
    body: unknown,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by PhoneSupportProvider; CALL-E deliveries carry no signature headers to inspect
    _headers: Headers,
  ): Promise<NormalizedWebhookResult> {
    const payload = body as {
      id?: string;
      type?: string;
      data?: { id?: string };
    };

    // WebhookEvent.data is the terminal CallTask snapshot. We take only the id
    // from it and re-read canonical state from the API, so a spoofed body
    // cannot inject a fabricated call result.
    const callId = payload?.data?.id;
    if (!callId) {
      throw new Error(
        "CALL-E webhook payload did not contain data.id (expected a WebhookEvent)",
      );
    }

    const normalizedCall = await this.getCall(callId);

    return {
      providerCallId: callId,
      normalizedCall,
      rawPayload: body,
      // Deliveries are unsigned upstream; the callback-token check in the route
      // plus this canonical re-fetch are what make the result trustworthy.
      signatureValid: true,
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function resolveCalleBaseUrl(configuredBaseUrl?: string): string {
  const candidate = configuredBaseUrl?.trim() || OFFICIAL_CALLE_ORIGIN;

  try {
    const url = new URL(candidate);
    const isOriginOnly =
      url.origin === OFFICIAL_CALLE_ORIGIN &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password;

    if (isOriginOnly) {
      return OFFICIAL_CALLE_ORIGIN;
    }
  } catch {
    // Fall through to the same fail-closed configuration error.
  }

  throw new Error(
    `CALLE_BASE_URL must be the official CALL-E origin: ${OFFICIAL_CALLE_ORIGIN}`,
  );
}

function mapCalleStatus(status: Call["status"]): CallStatus {
  switch (status) {
    case "queued":
      return "QUEUED";
    case "in_progress":
      return "IN_PROGRESS";
    case "completed":
      return "COMPLETED";
    case "failed":
      return "FAILED";
    case "canceled":
      return "CANCELED";
    default:
      return "UNKNOWN";
  }
}

// CALL-E has no `outcome` field. The business outcome lives in the structured
// result our own result_schema asked for (`disposition`), so prefer that and
// fall back to lifecycle status when the call never produced a result.
function deriveOutcome(call: Call): CallOutcome {
  const disposition = (call.structuredResult as { disposition?: string } | null)
    ?.disposition;

  switch (disposition) {
    case "completed":
      return "COMPLETED";
    case "partial":
      return "ANSWERED";
    case "declined":
      return "DECLINED";
    case "wrong_person":
      return "WRONG_PERSON";
    case "verification_failed":
      return "VERIFICATION_FAILED";
    case "voicemail":
      return "VOICEMAIL";
    case "no_answer":
      return "NO_ANSWER";
    case "failed":
      return "FAILED";
    default:
      break;
  }

  switch (call.status) {
    case "failed":
      return "FAILED";
    case "canceled":
      return "CANCELED";
    case "completed":
      return call.taskCompleted ? "COMPLETED" : "ANSWERED";
    default:
      return "UNKNOWN";
  }
}

function primaryRecipient(call: Call): CallRecipient | undefined {
  return call.recipients?.[0];
}

// Flatten transcript turns from every attempt into readable text. Turns are
// per attempt, so attempts are separated to keep retries distinguishable.
function flattenTranscript(call: Call): string | undefined {
  const recipient = primaryRecipient(call);
  if (!recipient) return undefined;

  const attempts = recipient.attempts ?? [];
  const blocks: string[] = [];

  for (const attempt of attempts) {
    const turns = attempt.transcriptTurns ?? [];
    if (turns.length === 0) continue;

    const lines = turns.map((turn) => {
      const speaker =
        turn.speaker === "bot"
          ? "AI Agent"
          : turn.speaker === "user"
            ? "Customer"
            : "Unknown";
      const stamp =
        typeof turn.offset_seconds === "number"
          ? `[${formatOffset(turn.offset_seconds)}] `
          : "";
      return `${stamp}[${speaker}]: ${turn.text}`;
    });

    blocks.push(
      (attempts.length > 1 ? `--- attempt ${attempt.id} ---\n` : "") +
        lines.join("\n"),
    );
  }

  return blocks.length > 0 ? blocks.join("\n\n") : undefined;
}

function formatOffset(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function normalizeCalleCall(call: Call): NormalizedCall {
  const recipient = primaryRecipient(call);
  const attempts = recipient?.attempts ?? [];
  const firstAttempt = attempts[0];
  const lastAttempt = attempts[attempts.length - 1];

  // Attempt-level failures are more specific than task-level ones, so surface
  // those when the task itself did not report a failure code.
  const failedAttempt = attempts.find((a) => a.failureCode);

  return {
    providerCallId: call.id,
    status: mapCalleStatus(call.status),
    outcome: deriveOutcome(call),
    taskCompleted: call.taskCompleted ?? false,
    recipientPhone: recipient?.phones?.[0] ?? "",
    completionConfidenceScore: call.completionConfidence?.score,
    completionConfidenceLabel: call.completionConfidence?.label,
    structuredResult:
      (call.structuredResult as Record<string, unknown> | null) ??
      (recipient?.structuredResult as Record<string, unknown> | null) ??
      undefined,
    summary: call.summary ?? recipient?.summary ?? undefined,
    transcript: flattenTranscript(call),
    evidence: call.evidence ?? [],
    errorCode: call.failureCode ?? failedAttempt?.failureCode ?? undefined,
    errorMessage:
      call.failureMessage ?? failedAttempt?.failureMessage ?? undefined,
    startedAt: firstAttempt?.startedAt ?? undefined,
    connectedAt: firstAttempt?.startedAt ?? undefined,
    completedAt: call.completedAt ?? lastAttempt?.completedAt ?? undefined,
    createdAt: call.createdAt,
    updatedAt: call.completedAt ?? call.createdAt,
  };
}

function wrapCalleError(error: unknown, context: string): Error {
  if (error instanceof CalleAPIError) {
    return new Error(
      `CALL-E ${context} failed (${error.status} ${error.code}): ${error.message}`,
      { cause: error },
    );
  }
  if (error instanceof Error) {
    return new Error(`CALL-E ${context} failed: ${error.message}`, {
      cause: error,
    });
  }
  return new Error(`CALL-E ${context} failed: ${String(error)}`);
}
