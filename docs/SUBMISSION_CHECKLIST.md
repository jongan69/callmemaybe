# Submission checklist

This list separates repository-complete work from external actions that require
the submitter's accounts, controlled phone numbers, or legal declarations.

## Repository and product

- [x] Merchant overview, outreach, cases, approvals, automations, and settings
- [x] Customer-account and thank-you UI extensions
- [x] Carrier and customer call workflows
- [x] Official CALL-E SDK plus safe fixture provider
- [x] Strict per-issue structured-result schemas
- [x] Deterministic policy engine with mutation approval defense
- [x] Fresh Shopify order re-read and comprehensive drift abort
- [x] Current Shopify mutations validated against 2026-07
- [x] Shopify policy-text sync wired into Settings
- [x] Live recent orders and tracking context in Outreach
- [x] Session-token shop/customer/order scoping
- [x] Consent, rate limits, deduplication, idempotency, and audit trail
- [x] Encrypted raw personal data and redacted merchant transcript
- [x] Configurable transcript retention and 30-day privacy export expiry
- [x] Mandatory data request/customer redact/shop redact webhooks
- [x] Public landing, logo, icon, project cover, README, security policy, and CI
- [x] 57 tests, typecheck, lint, production build, and migration verification

## Demo environment

- [ ] Fill `.env` with the final Shopify/CALL-E credentials
- [ ] Generate production encryption/hash secrets
- [ ] Run `npm run verify:calle`
- [ ] Complete one controlled real call end to end
- [ ] Confirm the carrier stand-in disclosure is in the narration
- [ ] Enable the customer-account and thank-you extensions on the dev store
- [ ] Create a private token-protected reviewer URL or include install steps
- [ ] Verify `/health` and the complete reviewer path from a signed-out browser

## Devpost

- [x] Project name, tagline, long description, technology list, and testing copy
      prepared in `docs/DEVPOST_SUBMISSION.md`
- [x] 1200×630 thumbnail prepared at `public/devpost-cover.png`
- [x] Three-minute shot list and narration prepared
- [ ] Record, caption, and publicly upload the video
- [x] Add the community-list PR URL: https://github.com/CALLE-AI/awesome-phone-call-agents/pull/125
- [ ] Enter the CALL-E account email
- [ ] Enter the submitter's true country and eligibility/conflict declarations
- [ ] Review the draft while signed out
- [ ] Click final submit

## Shopify App Store (not required for the hackathon)

- [x] Code-level self-review documented in `docs/SHOPIFY_APP_REVIEW.md`
- [ ] Stable HTTPS production deployment
- [ ] Listing privacy/support/terms URLs
- [ ] Billing decision and configuration
- [ ] Reviewer credentials and compliance-webhook delivery evidence
