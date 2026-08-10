# Security policy

CallMeMaybe initiates calls and can execute merchant-approved Shopify order
changes. Provider output is untrusted evidence, never authorization.

## Trust boundaries

- Shopify admin routes authenticate the embedded session and tenant-scope every
  lookup to the authenticated shop.
- Buyer-extension routes validate Shopify session tokens, derive shop and
  customer identity from signed claims, and verify order ownership with a
  server-side Shopify read. Client-provided shop/customer identities are ignored.
- Every call placement passes the central eligibility service. UI routes and
  workers cannot dial around it.
- CALL-E callbacks require a secret route token and unique per-attempt nonce,
  have a bounded validity window, are deduplicated, and are reconciled against a
  canonical CALL-E read before terminal state is accepted.
- Shopify privacy and lifecycle webhooks use Shopify authentication and durable,
  idempotent processing.
- Shopify mutations require merchant approval. The app re-reads and hashes the
  order immediately before mutation; drift aborts the action.

## Data protection

- TLS is required for production ingress and PostgreSQL connections.
- Sensitive fields use versioned AES-256-GCM encryption. Prior keys can be kept
  read-only during a rotation window; production has no fallback key.
- Phone matching, suppression, tokens, and external identifiers use keyed or
  cryptographic hashes. Only the last four phone digits are shown to merchants.
- CallMeMaybe stores no call audio and no raw transcript. CALL-E transcript
  content is processed transiently to derive a redacted summary and encrypted
  structured result, then discarded by the application.
- Logs and Sentry use an explicit denylist/redactor and must never include
  session tokens, credentials, phone numbers, addresses, transcripts, or raw
  structured call output. Sentry runs with `sendDefaultPii=false`.
- Protected-data reads, decryptions, exports, mutations, and erasures generate
  structured audit events with non-PII correlation identifiers.
- Operational case data is scheduled for deletion 90 days after closure by
  default. Encrypted privacy exports expire after 30 days. Region-specific legal
  retention can only be enabled through an approved policy revision.

## Production safeguards

- Production refuses to start in fixture mode or with incomplete Shopify,
  billing, CALL-E callback, PostgreSQL, encryption, legal, status, support, or
  monitoring configuration.
- Only the official production or test CALL-E HTTPS origins are accepted.
- Dynamic OpenAI/DeepSeek task generation is disabled in production; versioned
  local templates are the sole task-generation path and CALL-E is the only v1
  AI processor of call content.
- All region policies default disabled and require legal approval, vendor
  production approval, an effective date, enabled locale/script evidence, and a
  release-specific kill-switch decision.
- Global, shop, and region kill switches can stop dialing without disabling
  merchant access, billing reconciliation, or privacy handling.
- Jobs have stable idempotency keys, bounded retry/backoff, and a dead-letter
  queue. Web, worker, cron, and PostgreSQL are isolated services.

## Vulnerability reporting

Do not open a public issue containing a vulnerability or any customer data.
Use GitHub Security Advisories or the published `PUBLIC_SECURITY_EMAIL` address.
Include the affected release, impact, and reproduction steps, but never include
credentials, tokens, phone numbers, addresses, transcripts, or customer records.

Supported releases are the currently deployed production tag and the latest
security-supported patch documented in `CHANGELOG.md`. P1 reports target a
one-hour acknowledgement; other reports target one business day.
