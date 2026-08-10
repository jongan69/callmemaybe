# Implementation status

Updated 2026-08-09. This document separates repository implementation from
external release evidence.

## Implemented in the repository

- PostgreSQL-only Prisma baseline and PostgreSQL-backed pg-boss jobs.
- Isolated web, worker, cron, and managed database Render blueprint.
- Canonical fail-closed provider configuration and official CALL-E origin
  allowlist.
- Authenticated, nonce-bound, replay-resistant callbacks with canonical refetch.
- Independent consent records, revocation, suppression, attempt spacing, and
  authenticated buyer-extension APIs.
- Strict buyer-request and queue payload schemas, with shop identity resolved
  server-side for every protected route and resolution job.
- Single-use customer-account verification challenge for customer calls.
- Central call eligibility decisions and global/shop/region controls.
- Disabled-by-default registry for 28 target regions, 12 buyer-extension locale
  bundles, and draft consent/call-script copy for all 12 target languages.
- Versioned field encryption, keyed hashes, minimized results, no stored audio
  or raw transcripts, privacy queue, retention sweep, and audit events.
- Active subscription synchronization, completed-call ledger, usage reporting,
  retries/reversals, trial/included classification, and the 2,250-call ceiling.
- Merchant approval, fresh Shopify order snapshot, drift rejection, and
  idempotent resolution execution.
- Liveness/readiness routes, redacted JSON logging, Sentry initialization,
  Better Stack heartbeat, containerized deployment, and release runbooks.
- App icon and feature-image assets at required dimensions.

## Blocked outside the repository

- Trademark clearance and counsel-approved privacy/terms/DPA/calling package.
- Level 2 protected customer data and requested-field approval.
- Written CALL-E production authorization, KYC/caller ID, retention, DPA, and
  support evidence for every one of the 28 regions.
- Complete merchant-admin/help-center localization plus professional human
  translation, legal review, call-script review, and back-translation for every
  required locale.
- Branded domain/DNS, Render services/secrets, production Shopify configuration,
  App Pricing event handle, monitoring accounts, and tested backup restoration.
- Final six screenshots, marketing video, reviewer screencast, reviewer store,
  controlled test numbers, and credentials captured from the signed release.
- Independent reviewer rehearsal and engineering/legal/vendor/localization/
  operations sign-off.

The authoritative gate is
[`submission/RELEASE_READINESS.md`](../submission/RELEASE_READINESS.md).
