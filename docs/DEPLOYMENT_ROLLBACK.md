# Deployment and rollback runbook

## Database transport

The `DATABASE_URL` secret must use Render's external PostgreSQL URL with
`sslmode=require` (or stricter). Do not replace it with Blueprint
`fromDatabase.connectionString`: Render documents that internal URL as a
private-network, non-TLS connection, while CallMeMaybe's production policy
requires encryption in transit. Keep the database's external IP allowlist empty
until the web, worker, and cron outbound ranges have been explicitly added.

## Promotion

1. Merge through a reviewed PR after required CI passes.
2. Tag the immutable release candidate.
3. Deploy the tag to staging with staging-only Shopify, CALL-E, Render, database,
   caller ID, and test-number credentials.
4. Run migrations from an empty database and against a staging copy; validate
   the 28 disabled regional records.
5. Exercise install, pricing, consent, both call legs, callback replay rejection,
   usage, approval/drift, revocation, and privacy webhooks.
6. Take and verify a managed PostgreSQL backup immediately before production
   migration. Record backup ID, timestamp, release tag, and operator.
7. Promote the exact tag. Run `/health/live`, `/health/ready`, embedded-admin,
   buyer-extension, queue, callback, billing, and privacy smoke tests.
8. Keep all production regions disabled until their signed release gate is
   attached. Enable through the smallest approved scope.

## Rollback

1. Use the global calling switch first; this stops new calls while keeping
   merchant access, privacy, and billing reconciliation available.
2. Roll the web, worker, and cron services back to the last signed image tag.
3. Do not reverse a database migration unless its reviewed down procedure is
   known safe. Prefer forward repair. Restore only after confirming data loss
   tradeoffs and recording the approval.
4. Reconcile in-flight provider calls and accepted Shopify usage events before
   retrying jobs. Never replay a mutation without its idempotency key.
5. Run readiness and smoke checks, document the incident, and keep regions off
   until the remediation is approved.

Required release evidence: CI URL, tag/digest, migration output, backup ID,
restore-test result, smoke-test output, enabled-region list, operator, approver,
and rollback decision.
