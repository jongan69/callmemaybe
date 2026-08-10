# CALL-E integration

How CallmeMaybe talks to CALL-E, and how to verify it works.

## Surface used

Official TypeScript server SDK, `@call-e/calle@0.6.0`, imported and called at
runtime in `app/providers/calle-provider.server.ts`.

| SDK call | Used for |
|---|---|
| `client.calls.create(input, { idempotencyKey })` | Placing the support call |
| `client.calls.get(callId)` | Canonical call state and terminal result |
| `client.calls.listEvents(callId, { cursor, limit })` | Call timeline shown in the merchant admin |

Contract reference: <https://docs.heycall-e.com/api-reference/calls>

## Request shape

```ts
await client.calls.create(
  {
    task: taskText,                     // decrypted at dial time, never logged
    recipients: [{ phones: [e164], region, locale }],
    resultSchema,                       // issue-specific, see below
    metadata: { product: "callmemaybe", case_id, shop_id, ... },
    webhookUrl,                         // /webhooks/calle/:token
  },
  { idempotencyKey: callPlan.idempotencyKey },
);
```

## Result schema

`app/lib/call-plan.ts` builds the JSON Schema CALL-E extracts into. Two
properties of the CALL-E contract drive its design:

1. **`additionalProperties: false` is enforced strictly.** Any field the voice
   agent collects that isn't declared is rejected, and the *entire*
   `structured_result` comes back `null` — not a partial object. So
   issue-specific fields must be declared up front. `ADDRESS_CHANGE` declares
   the address fields; `RETURN` declares the item fields.
2. **`description` steers extraction but does not validate.** Hard validation
   comes only from `type`, `required`, `enum`, and `additionalProperties`. So
   descriptions are written as decision rules ("Use yes only when the customer
   explicitly confirmed the address after it was read back"), while the
   enums do the enforcing. String enums with an `unknown` member are preferred
   over booleans everywhere a call might not produce clear evidence.

## Normalization

`normalizeCalleCall()` maps the CALL-E `CallTask` onto the app's provider-
agnostic `NormalizedCall`. Points worth knowing:

- **There is no `outcome` field.** Business outcome is derived from
  `structured_result.disposition`, which our own result schema asks for, and
  falls back to lifecycle status when the call produced no result.
- **Status is five values**, not a granular telephony set: `queued`,
  `in_progress`, `completed`, `failed`, `canceled`. Ringing/busy/no-answer are
  not lifecycle states; they surface as disposition or attempt failure codes.
- **Transcripts are per attempt**, as `transcript_turns` under
  `recipients[].attempts[]`, not a single string. They're flattened with
  speaker labels and offsets, keeping retries distinguishable.
- **`completion_confidence` is an object** `{ score, label }`.
- **Failures are `failure_code` / `failure_message`**, at both task and attempt
  level. Attempt-level is more specific and is preferred when the task itself
  reports nothing.
- **Events are not embedded** in the call object. They come from a separate
  cursor-paginated endpoint and carry no sequence number, so a stable sequence
  is derived from arrival order.

## Webhooks

CALL-E posts terminal events to `POST /webhooks/calle/:token`:

```json
{ "id": "evt_...", "type": "call.completed", "created_at": "...", "data": { /* CallTask */ } }
```

**Deliveries are unsigned.** The SDK's `client.webhooks.verify()` is marked
deprecated upstream precisely because current deliveries carry no signature
headers. Authenticity therefore rests on two independent controls:

1. An unguessable per-install token in the callback URL path.
2. Re-fetching the canonical call from the API before trusting anything. The
   handler reads only `data.id` from the payload; every field it acts on comes
   from `client.calls.get()`. A spoofed body cannot inject a fabricated result.

Idempotency uses `WebhookEvent.id`, which CALL-E documents as the key for
webhook side effects. Receipts are retained so redelivery is a no-op, and
deleted on processing failure so redelivery retries instead of being silently
swallowed.

## Verifying

```bash
# Preflight. Checks credentials and contract wiring. Places NO call.
npm run verify:calle

# Places ONE real outbound call and waits for the terminal result.
# Consumes one call credit.
npm run verify:calle -- --call +15551234567
```

The script drives the app's own `CallePhoneSupportProvider` and its real task
template and result schema, so a pass is evidence that the shipping code path
works — not that a separate toy script does.

The auth probe reads a call id that cannot exist. A valid key returns 404
(reported as PASS); an invalid one returns 401 (reported as FAIL). Either way no
call is placed.

Environment:

```
CALLE_API_KEY=            # from https://dashboard.heycall-e.com/account/api-keys
CALLE_BASE_URL=           # optional; if set, must be https://api.heycall-e.com
CALLE_WEBHOOK_TOKEN=      # unguessable; forms the callback URL path
CALL_PROVIDER=calle
CALLE_REAL_CALLS_ENABLED=true
```

With `CALL_PROVIDER=fake` or `CALLE_REAL_CALLS_ENABLED` unset, the app uses the
fixture provider in `app/providers/fake-calle.server.ts` and places no calls.
