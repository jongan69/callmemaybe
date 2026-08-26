# CALL-E integration contract

CALL-E is the only production AI processor of call content in v1. The app uses
the official SDK for placement and canonical reads and sends only the authorized
recipient number, versioned task template, strict result schema, callback URL,
locale/region metadata, and non-PII idempotency identifiers.

## Provider configuration

`CALL_PROVIDER` accepts only `fixture` or `calle`. Fixture mode places no call.
Live mode also requires `CALLE_REAL_CALLS_ENABLED=true`, an API key, public HTTPS
app URL, and a 32+ character callback route token. Production refuses fixture or
incomplete modes.

`CALLE_BASE_URL` may be omitted or set to exactly
`https://api.heycall-e.com`. HTTP, the test origin, other hosts, lookalike
subdomains, ports, credentials, paths, queries, fragments, casing changes, and
values requiring normalization are rejected before credentials can be sent.

## Callback acceptance

Every placement receives a unique random nonce stored only as a hash and bound
to the call attempt with a 24-hour expiry. The callback URL includes the global
secret path, attempt ID, and nonce.

Callback processing:

1. Authenticate the secret path with constant-time comparison.
2. Strictly validate the callback DTO and terminal timestamp.
3. Load the attempt by tenant-independent opaque ID and verify nonce/expiry.
4. Deduplicate provider event ID and payload hash.
5. Verify the callback call reference matches the stored provider call.
6. Refetch the canonical call from CALL-E.
7. Accept only a terminal canonical result; otherwise reconciliation continues.

Callback payloads and raw transcripts are never stored. Event history is reduced
to allowlisted state fields plus a keyed payload hash.

## Result and billing contract

The provider adapter normalizes CALL-E states into `CallStatus`, `CallOutcome`, a
schema-validated structured result, confidence, completion timestamps, and a
transient transcript string. The application stores an encrypted structured
result and redacted summary only.

Only canonical status `COMPLETED`, canonical outcome `COMPLETED`, and a valid
completion timestamp create a completed-call usage unit. All other terminal and
nonterminal states create no charge. The local call-attempt ID is the permanent
usage idempotency source.

## Regional production gate

Provider connectivity or testing coverage is not production authorization. Each
of the 28 release regions remains disabled until written CALL-E production
routing, caller-ID/KYC, line, DPA/retention, capacity/support, and counsel evidence
is attached to the versioned regional policy.

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
bun run verify:calle

# Places ONE real outbound call and waits for the terminal result.
# Consumes one call credit.
bun run verify:calle -- --call +15551234567
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

With `CALL_PROVIDER=fixture` and `CALLE_REAL_CALLS_ENABLED=false`, the app uses
the fixture provider and places no calls. Invalid or ambiguous gate values stop
provider initialization. Real test calls require an explicit option and a
number controlled by the operator.
