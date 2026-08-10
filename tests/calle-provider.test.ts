import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CallePhoneSupportProvider } from "../app/providers/calle-provider.server";

// These tests drive the real provider through an injected fetch. Nothing here
// touches the network or spends a call credit, but the assertions are against
// the published CALL-E contract at docs.heycall-e.com/api-reference/calls, so a
// drift between our request shape and theirs fails here rather than on a live
// call.

type Captured = {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
};

function providerWith(
  handler: (req: Captured) => { status?: number; body: unknown },
  captureInto?: Captured[],
) {
  return new CallePhoneSupportProvider(
    "test_key",
    "https://api.heycall-e.com",
    async (input: Request) => {
      const raw = await input.clone().text();
      const captured: Captured = {
        url: input.url,
        method: input.method,
        headers: input.headers,
        body: raw ? JSON.parse(raw) : undefined,
      };
      captureInto?.push(captured);
      const { status = 200, body } = handler(captured);
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    },
  );
}

describe("configuration", () => {
  test("rejects a non-HTTPS CALL-E base URL", () => {
    assert.throws(
      () =>
        new CallePhoneSupportProvider("test_key", "http://api.heycall-e.com"),
      /Refusing to send the CALL-E API key/,
    );
  });

  test("rejects a different CALL-E base URL host", () => {
    assert.throws(
      () =>
        new CallePhoneSupportProvider("test_key", "https://attacker.example"),
      /Refusing to send the CALL-E API key/,
    );
  });
});

// A terminal CallTask exactly as the API documents it.
function callTaskFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "call_123",
    object: "call_task",
    status: "completed",
    task: "Call the recipient.",
    recipients: [
      {
        id: "rcp_123",
        phones: ["+15551234567"],
        locale: "en-US",
        region: "US",
        status: "completed",
        structured_result: null,
        summary: "Recipient confirmed the new address.",
        attempts: [
          {
            id: "att_1",
            phone: "+15551234567",
            status: "completed",
            started_at: "2026-08-01T17:00:05Z",
            completed_at: "2026-08-01T17:01:00Z",
            summary: "Confirmed.",
            transcript_turns: [
              {
                offset_seconds: 0,
                speaker: "bot",
                text: "This is an AI assistant.",
              },
              { offset_seconds: 8, speaker: "user", text: "Go ahead." },
            ],
            provider_call_id: "prov_1",
            failure_code: null,
            failure_message: null,
          },
        ],
      },
    ],
    structured_result: {
      disposition: "completed",
      identity_status: "verified",
    },
    summary: "Address confirmed.",
    task_completed: true,
    completion_confidence: { score: 0.92, label: "high" },
    evidence: ["The customer confirmed the address."],
    metadata: { case_id: "case_1" },
    failure_code: null,
    failure_message: null,
    created_at: "2026-08-01T17:00:00Z",
    completed_at: "2026-08-01T17:01:00Z",
    ...overrides,
  };
}

describe("base URL allowlist", () => {
  test("defaults to the official production origin when unset", async () => {
    const seen: Captured[] = [];
    const provider = new CallePhoneSupportProvider(
      "test_key",
      undefined,
      async (input) => {
        seen.push({
          url: input.url,
          method: input.method,
          headers: input.headers,
          body: undefined,
        });
        return new Response(JSON.stringify(callTaskFixture()), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      },
    );

    await provider.createCall({
      recipientPhone: "+15551234567",
      region: "US",
      locale: "en-US",
      idempotencyKey: "k",
      taskText: "task",
      resultSchema: {},
      metadata: {},
    });

    assert.ok(seen[0].url.startsWith("https://api.heycall-e.com/v1/calls"));
  });

  test("accepts only the exact official production origin", () => {
    new CallePhoneSupportProvider(
      "test_key",
      "https://api.heycall-e.com",
      async () => new Response(),
    );
    assert.throws(
      () =>
        new CallePhoneSupportProvider(
          "test_key",
          "https://test-api.heycall-e.com",
          async () => new Response(),
        ),
      /Refusing to send the CALL-E API key/,
    );
  });

  test("refuses an arbitrary host even over HTTPS", () => {
    assert.throws(
      () =>
        new CallePhoneSupportProvider(
          "test_key",
          "https://api.example.test",
          async () => new Response(),
        ),
      /Refusing to send the CALL-E API key/,
    );
  });

  test("refuses plain HTTP", () => {
    assert.throws(
      () =>
        new CallePhoneSupportProvider(
          "test_key",
          "http://api.heycall-e.com",
          async () => new Response(),
        ),
      /Refusing to send the CALL-E API key/,
    );
  });

  test("refuses a lookalike subdomain of the official origin", () => {
    assert.throws(
      () =>
        new CallePhoneSupportProvider(
          "test_key",
          "https://api.heycall-e.com.evil.example",
          async () => new Response(),
        ),
      /Refusing to send the CALL-E API key/,
    );
  });

  test("refuses the official origin with normalization, path, port, credentials, query, or fragment", () => {
    for (const bad of [
      " https://api.heycall-e.com",
      "HTTPS://api.heycall-e.com",
      "https://api.heycall-e.com/v2",
      "https://api.heycall-e.com:443",
      "https://api.heycall-e.com:8443",
      "https://user:pass@api.heycall-e.com",
      "https://api.heycall-e.com?target=other",
      "https://api.heycall-e.com#fragment",
    ]) {
      assert.throws(
        () =>
          new CallePhoneSupportProvider(
            "test_key",
            bad,
            async () => new Response(),
          ),
        /Refusing to (send the CALL-E API key|use CALLE_BASE_URL)/,
        `${bad} must be rejected`,
      );
    }
  });

  test("refuses an unparseable value", () => {
    assert.throws(
      () =>
        new CallePhoneSupportProvider(
          "test_key",
          "api.heycall-e.com",
          async () => new Response(),
        ),
      /Refusing to use invalid CALLE_BASE_URL/,
    );
  });
});

describe("createCall request shape", () => {
  test("matches the documented CreateCallRequest", async () => {
    const seen: Captured[] = [];
    const provider = providerWith(
      () => ({ status: 201, body: callTaskFixture() }),
      seen,
    );

    await provider.createCall({
      recipientPhone: "+15551234567",
      region: "US",
      locale: "en-US",
      idempotencyKey: "case_1_attempt_1",
      taskText: "Call Alex about order #1043.",
      resultSchema: { type: "object", properties: {} },
      metadata: { case_id: "case_1" },
      webhookUrl: "https://example.test/webhooks/calle/tok",
    });

    assert.equal(seen.length, 1);
    const req = seen[0];
    assert.equal(req.method, "POST");
    assert.match(req.url, /\/v1\/calls$/);

    const body = req.body as Record<string, unknown>;

    // Regression guard: the original implementation sent `recipients: [{ phone,
    // result_schema }]` with region/locale at the top level. The contract wants
    // `phones` as an array inside the recipient, and the schema at top level.
    assert.deepEqual(body.recipients, [
      { phones: ["+15551234567"], region: "US", locale: "en-US" },
    ]);
    assert.ok(!("phone" in (body.recipients as Record<string, unknown>[])[0]));
    assert.ok(!("region" in body), "region must not be top level");
    assert.ok(!("locale" in body), "locale must not be top level");
    assert.deepEqual(body.result_schema, { type: "object", properties: {} });
    assert.equal(body.task, "Call Alex about order #1043.");
    assert.equal(body.webhook_url, "https://example.test/webhooks/calle/tok");
    assert.deepEqual(body.metadata, { case_id: "case_1" });
  });

  test("sends the idempotency key as a header", async () => {
    const seen: Captured[] = [];
    const provider = providerWith(
      () => ({ status: 201, body: callTaskFixture() }),
      seen,
    );

    await provider.createCall({
      recipientPhone: "+15551234567",
      region: "US",
      locale: "en-US",
      idempotencyKey: "stable_key_1",
      taskText: "task",
      resultSchema: {},
      metadata: {},
    });

    assert.equal(seen[0].headers.get("Idempotency-Key"), "stable_key_1");
  });

  test("omits webhook_url when not configured", async () => {
    const seen: Captured[] = [];
    const provider = providerWith(
      () => ({ status: 201, body: callTaskFixture() }),
      seen,
    );

    await provider.createCall({
      recipientPhone: "+15551234567",
      region: "US",
      locale: "en-US",
      idempotencyKey: "k",
      taskText: "task",
      resultSchema: {},
      metadata: {},
    });

    assert.ok(!("webhook_url" in (seen[0].body as Record<string, unknown>)));
  });

  test("surfaces API errors with status and code", async () => {
    const provider = providerWith(() => ({
      status: 422,
      body: { error: { code: "invalid_result_schema", message: "bad schema" } },
    }));

    await assert.rejects(
      () =>
        provider.createCall({
          recipientPhone: "+15551234567",
          region: "US",
          locale: "en-US",
          idempotencyKey: "k",
          taskText: "t",
          resultSchema: {},
          metadata: {},
        }),
      /422/,
    );
  });
});

describe("normalization", () => {
  test("maps a completed call", async () => {
    const provider = providerWith(() => ({ body: callTaskFixture() }));
    const call = await provider.getCall("call_123");

    assert.equal(call.status, "COMPLETED");
    assert.equal(call.outcome, "COMPLETED");
    assert.equal(call.taskCompleted, true);
    assert.equal(call.recipientPhone, "+15551234567");

    // Confidence is a nested object upstream, not two flat fields.
    assert.equal(call.completionConfidenceScore, 0.92);
    assert.equal(call.completionConfidenceLabel, "high");

    assert.deepEqual(call.evidence, ["The customer confirmed the address."]);
    assert.equal(call.completedAt, "2026-08-01T17:01:00Z");
  });

  test("flattens transcript turns with speaker labels", async () => {
    const provider = providerWith(() => ({ body: callTaskFixture() }));
    const call = await provider.getCall("call_123");

    assert.ok(call.transcript);
    assert.match(call.transcript!, /\[AI Agent\]: This is an AI assistant\./);
    assert.match(call.transcript!, /\[Customer\]: Go ahead\./);
    assert.match(call.transcript!, /\[0:08\]/);
  });

  test("separates attempts when a call was retried", async () => {
    const fixture = callTaskFixture();
    const recipient = (fixture.recipients as Record<string, unknown>[])[0];
    const attempts = recipient.attempts as Record<string, unknown>[];
    recipient.attempts = [
      { ...attempts[0], id: "att_1" },
      { ...attempts[0], id: "att_2", completed_at: "2026-08-01T17:05:00Z" },
    ];

    const provider = providerWith(() => ({ body: fixture }));
    const call = await provider.getCall("call_123");

    assert.match(call.transcript!, /--- attempt att_1 ---/);
    assert.match(call.transcript!, /--- attempt att_2 ---/);
    // completedAt should come from the last attempt when the task has none.
    assert.equal(call.completedAt, "2026-08-01T17:01:00Z");
  });

  test("returns undefined transcript when there are no turns", async () => {
    const fixture = callTaskFixture();
    const recipient = (fixture.recipients as Record<string, unknown>[])[0];
    (recipient.attempts as Record<string, unknown>[])[0].transcript_turns = [];

    const provider = providerWith(() => ({ body: fixture }));
    const call = await provider.getCall("call_123");

    assert.equal(call.transcript, undefined);
  });

  test("maps every documented status value", async () => {
    const cases: Array<[string, string]> = [
      ["queued", "QUEUED"],
      ["in_progress", "IN_PROGRESS"],
      ["completed", "COMPLETED"],
      ["failed", "FAILED"],
      ["canceled", "CANCELED"],
    ];

    for (const [upstream, expected] of cases) {
      const provider = providerWith(() => ({
        body: callTaskFixture({ status: upstream, structured_result: null }),
      }));
      const call = await provider.getCall("call_123");
      assert.equal(
        call.status,
        expected,
        `${upstream} should map to ${expected}`,
      );
    }
  });

  test("derives outcome from disposition, not a nonexistent outcome field", async () => {
    const cases: Array<[string, string]> = [
      ["completed", "COMPLETED"],
      ["voicemail", "VOICEMAIL"],
      ["wrong_person", "WRONG_PERSON"],
      ["verification_failed", "VERIFICATION_FAILED"],
      ["declined", "DECLINED"],
      ["no_answer", "NO_ANSWER"],
    ];

    for (const [disposition, expected] of cases) {
      const provider = providerWith(() => ({
        body: callTaskFixture({ structured_result: { disposition } }),
      }));
      const call = await provider.getCall("call_123");
      assert.equal(call.outcome, expected);
    }
  });

  test("falls back to lifecycle status when there is no structured result", async () => {
    const provider = providerWith(() => ({
      body: callTaskFixture({
        status: "failed",
        structured_result: null,
        task_completed: null,
        completion_confidence: null,
        failure_code: "no_answer_after_retries",
        failure_message: "Recipient did not answer.",
      }),
    }));

    const call = await provider.getCall("call_123");
    assert.equal(call.status, "FAILED");
    assert.equal(call.outcome, "FAILED");
    assert.equal(call.taskCompleted, false);
    assert.equal(call.errorCode, "no_answer_after_retries");
    assert.equal(call.errorMessage, "Recipient did not answer.");
    assert.equal(call.completionConfidenceScore, undefined);
  });

  test("prefers attempt-level failure when the task reports none", async () => {
    const fixture = callTaskFixture({
      status: "failed",
      structured_result: null,
    });
    const recipient = (fixture.recipients as Record<string, unknown>[])[0];
    const attempt = (recipient.attempts as Record<string, unknown>[])[0];
    attempt.failure_code = "busy";
    attempt.failure_message = "Line busy.";

    const provider = providerWith(() => ({ body: fixture }));
    const call = await provider.getCall("call_123");

    assert.equal(call.errorCode, "busy");
    assert.equal(call.errorMessage, "Line busy.");
  });

  test("falls back to recipient-level structured result", async () => {
    const fixture = callTaskFixture({ structured_result: null });
    const recipient = (fixture.recipients as Record<string, unknown>[])[0];
    recipient.structured_result = {
      disposition: "completed",
      trace_opened: "yes",
    };

    const provider = providerWith(() => ({ body: fixture }));
    const call = await provider.getCall("call_123");

    assert.deepEqual(call.structuredResult, {
      disposition: "completed",
      trace_opened: "yes",
    });
  });
});

describe("events", () => {
  test("follows cursor pagination and assigns a stable sequence", async () => {
    let page = 0;
    const provider = providerWith(() => {
      page += 1;
      if (page === 1) {
        return {
          body: {
            object: "list",
            data: [
              {
                id: "evt_1",
                type: "call.queued",
                call_id: "call_123",
                created_at: "2026-08-01T17:00:00Z",
                level: "info",
                status: "queued",
                message: "Queued.",
                details: {},
              },
            ],
            next_cursor: "cur_2",
          },
        };
      }
      return {
        body: {
          object: "list",
          data: [
            {
              id: "evt_2",
              type: "call.completed",
              call_id: "call_123",
              created_at: "2026-08-01T17:01:00Z",
              level: "info",
              status: "completed",
              message: "Completed.",
              details: { region: "US" },
            },
          ],
          next_cursor: null,
        },
      };
    });

    const events = await provider.getEvents("call_123");

    assert.equal(events.length, 2);
    assert.equal(events[0].providerEventId, "evt_1");
    assert.equal(events[0].sequence, 1);
    assert.equal(events[1].providerEventId, "evt_2");
    assert.equal(events[1].sequence, 2);
    assert.equal(events[1].eventTime, "2026-08-01T17:01:00Z");
    assert.deepEqual(events[1].payload.details, { region: "US" });
  });
});

describe("webhook normalization", () => {
  test("reads data.id and re-fetches canonical state", async () => {
    const seen: Captured[] = [];
    const provider = providerWith(() => ({ body: callTaskFixture() }), seen);

    const result = await provider.normalizeWebhook(
      {
        id: "evt_abc",
        type: "call.completed",
        created_at: "2026-08-01T17:01:00Z",
        data: { id: "call_123" },
      },
      new Headers(),
    );

    assert.equal(result.providerCallId, "call_123");
    // The canonical re-fetch is what makes an unsigned delivery trustworthy.
    assert.equal(seen.length, 1);
    assert.match(seen[0].url, /\/v1\/calls\/call_123$/);
    assert.equal(seen[0].method, "GET");
  });

  test("does not trust a forged result in the payload body", async () => {
    const provider = providerWith(() => ({ body: callTaskFixture() }));

    const result = await provider.normalizeWebhook(
      {
        id: "evt_abc",
        type: "call.completed",
        data: {
          id: "call_123",
          // A spoofed body claiming the task succeeded with a forged result.
          task_completed: true,
          structured_result: {
            disposition: "completed",
            requested_action: "cancel_order",
          },
        },
      },
      new Headers(),
    );

    // Everything acted on comes from the API, not the payload.
    assert.deepEqual(result.normalizedCall.structuredResult, {
      disposition: "completed",
      identity_status: "verified",
    });
  });

  test("rejects a payload with no call id", async () => {
    const provider = providerWith(() => ({ body: callTaskFixture() }));

    await assert.rejects(
      () =>
        provider.normalizeWebhook(
          { id: "evt_abc", type: "call.completed" },
          new Headers(),
        ),
      /data\.id/,
    );
  });
});
