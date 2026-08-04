# Implementation Status

## Phase 0: Repository Audit ✅
- **Framework**: React Router v7 + @shopify/shopify-app-react-router v1.1.0
- **Database**: Prisma + SQLite
- **UI**: Polaris web components + App Bridge
- **API Version**: October25 (pinned)
- **Package Manager**: npm

## Phase 1: Domain Foundation ✅
- Domain enums and types (`app/lib/types.ts`)
- Prisma models (15 models: ShopSettings, SupportPolicy, SupportCase, CallAttempt, etc.)
- Database migration run successfully
- Encryption/hashing utilities (`app/lib/crypto.server.ts`)
- Error model (`app/lib/errors.server.ts`)
- Audit service (`app/services/audit.server.ts`)
- Policy engine (`app/services/policy.server.ts`)
- Provider interfaces defined

## Phase 2: Fake Provider & Case Lifecycle ✅
- Fake CALL-E provider (`app/providers/fake-calle.server.ts`)
  - 14 fixture scenarios
  - Simulated event timeline
  - No network calls
  - Deterministic fixture selection
- Provider factory (`app/providers/index.server.ts`)
- Support case service (`app/services/support-case.server.ts`)
  - Case creation with dedup and rate limiting
  - Call plan building with task templates
  - Call submission with fake provider
  - Result processing with policy evaluation
  - Schema validation

## Phase 3: Merchant Admin ✅
- Overview dashboard (`app/routes/app._index.tsx`)
- Cases list with filtering (`app/routes/app.cases.tsx`)
- Case detail with timeline, transcript, approval flow (`app/routes/app.cases.$caseId.tsx`)
- Pending approvals (`app/routes/app.approvals.tsx`)
- Automation policies (`app/routes/app.automations.tsx`)
- Settings with store identity, locale, calling config (`app/routes/app.settings.tsx`)
- Updated app navigation with all CallmeMaybe routes

## Phase 4: Customer API ✅
- Support request endpoint (`app/routes/api.customer-support.request.tsx`)
- Case status endpoint (`app/routes/api.customer-support.cases.$reference.tsx`)
- E.164 phone normalization
- CORS headers for customer-account extensions

## Phase 5: Webhooks & Health ✅
- CALL-E webhook handler with dedup (`app/routes/webhooks.calle.$token.tsx`)
- Shopify webhook configuration in `shopify.app.toml`
- Health check endpoint (`app/routes/health.tsx`)
- Scopes updated: orders, customers, products, legal_policies

## Build Results
- ✅ TypeScript type check: 0 errors
- ✅ Production build: successful

## Phase 6: Real CALL-E Integration ✅
Rebuilt on the official `@call-e/calle@0.6.0` server SDK. The previous provider
was written against a guessed REST shape and could not have succeeded against
the live API. See `docs/CALLE_INTEGRATION.md` for the contract and
`npm run verify:calle` to verify.

Fixed along the way:
- `submitCall` passed the literal string `"REDACTED"` as the phone number and
  task text. Now decrypts both at dial time.
- `ADDRESS_CHANGE` and `RETURN` shared the common result schema under
  `additionalProperties: false`, so CALL-E would have rejected every
  issue-specific field and returned a null structured result. The flagship demo
  was structurally impossible. Schemas are now issue-specific.
- The webhook handler deleted its own dedup receipt on success, so redelivery
  was never deduplicated, and passed an empty `shopId` into policy evaluation.
- Call events were read from a field CALL-E does not populate; they now come
  from the paginated events endpoint.

## Known gaps
- `transcriptRedacted` stores the raw transcript unredacted. Either implement
  redaction or rename the column — the current state contradicts the safety
  claims in `SUBMISSION_CHECKLIST.md`.
- Positioning: see `docs/POSITIONING.md`. The address-change framing does not
  survive the "why not just use a form?" objection.

## Remaining Work
- [ ] Customer-account UI extension (Shopify CLI `shopify app generate extension`)
- [ ] Shopify order mutation (address update via Admin GraphQL)
- [ ] Knowledge sync (Shopify policies)
- [ ] Demo seed data
- [ ] E2E tests
- [ ] Deploy to Shopify
- [ ] CALL-E community contribution

## Files Changed
- `prisma/schema.prisma` — Added 15 CallmeMaybe models
- `shopify.app.toml` — Updated scopes and webhooks
- `app/lib/types.ts` — Domain types and enums
- `app/lib/crypto.server.ts` — Encryption, hashing, verification codes
- `app/lib/errors.server.ts` — Error codes and formatting
- `app/services/audit.server.ts` — Immutable audit log
- `app/services/policy.server.ts` — Deterministic policy engine
- `app/services/support-case.server.ts` — Case lifecycle orchestration
- `app/providers/fake-calle.server.ts` — Fake CALL-E provider with fixtures
- `app/providers/index.server.ts` — Provider factory
- `app/routes/app.tsx` — Updated navigation
- `app/routes/app._index.tsx` — Overview dashboard
- `app/routes/app.cases.tsx` — Cases list
- `app/routes/app.cases.$caseId.tsx` — Case detail with approval flow
- `app/routes/app.approvals.tsx` — Pending approvals
- `app/routes/app.automations.tsx` — Policy configuration
- `app/routes/app.settings.tsx` — Shop settings
- `app/routes/api.customer-support.request.tsx` — Customer support API
- `app/routes/api.customer-support.cases.$reference.tsx` — Case status API
- `app/routes/webhooks.calle.$token.tsx` — CALL-E webhook
- `app/routes/health.tsx` — Health check
- `app/globals.d.ts` — Polaris web component types
- `.env.example` — Environment template
- `docs/IMPLEMENTATION_STATUS.md` — This file
