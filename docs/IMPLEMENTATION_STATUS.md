# Implementation status

Updated 2026-08-08.

## Complete

- React Router 7 Shopify embedded app using App Bridge/Polaris web components
- Shopify Admin GraphQL pinned to 2026-07 and validated with the Shopify AI
  Toolkit
- Live recent-order/tracking outreach, merchant case queue, approvals,
  automations, settings, policy sync, privacy exports, and audit timeline
- Customer-account order action, support form, one-time code, and case status
- Thank-you support guidance extension
- CALL-E provider using the official SDK plus a no-network fixture provider
- Carrier trace and customer callback/outreach task families with strict result
  schemas
- Canonical CALL-E result re-fetch, webhook deduplication, call and mutation
  idempotency
- Deterministic policy evaluation, mandatory approval for Shopify mutations, and
  full order drift detection immediately before write
- Address update, cancellation with async job confirmation, and order-note
  mutations
- Authenticated shop/customer scoping and live order ownership checks
- AES-256-GCM encryption, display transcript redaction, configurable retention,
  production secret enforcement, and mandatory Shopify privacy webhooks
- Branded public landing page, SVG/PNG logo assets, and 1200×630 project cover
- 57 tests, typecheck, lint, production build, migration-from-zero path, CI, and
  security/contribution/release documentation

## Deliberate limitations

- No scheduled call retries after no-answer; retry state is modeled but not
  scheduled.
- Recent orders are live, but exception classification is initiated by a
  merchant rather than an automatic carrier-event ingestion job.
- SQLite targets a single judgeable instance. Horizontal production deployment
  should use managed SQL and scheduled retention cleanup.
- The carrier demo uses an explicitly disclosed stand-in line. Real-world
  carrier cooperation requires permission and pilot validation.

## External release steps

- Configure production hosting/HTTPS and replace placeholder Shopify URLs.
- Complete one real CALL-E rehearsal on controlled numbers.
- Enable both extensions on the development/review store.
- Record and publish the three-minute demo.
- Insert the public video URL and submitter truth fields in Devpost.
- Deploy the Shopify app configuration after the production URL exists.
