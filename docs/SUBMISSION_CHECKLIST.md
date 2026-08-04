# Hackathon submission checklist

Claims here are only ticked when the code actually does the thing. An earlier
version of this file ticked several boxes that were not true; those are marked
where relevant so the history is legible.

## Product

- [x] Merchant admin (overview, outreach, cases, approvals, automations, settings)
- [x] Customer-account UI extension
- [x] Support case lifecycle: create → plan → call → result → policy → resolution
- [x] Two call legs: carrier (third-party) and customer
- [x] Fixture provider with 14 scenarios, places no calls
- [x] Structured result validation against issue-specific schemas
- [x] One-time verification codes, two-attempt limit
- [x] Policy engine (INFORMATIONAL / AUTOMATIC / APPROVAL / DISABLED)
- [x] Consent capture
- [x] Rate limiting and duplicate prevention
- [x] Append-only audit trail
- [x] **Shopify mutations execute on approval** — was previously ticked while
      the adapter was dead code; approval wrote a database row and stopped
- [ ] Knowledge sync from Shopify policies — code exists, nothing calls it
- [ ] Stuck-order detection from Shopify — currently seeded

## Safety

- [x] AI disclosure in every task instruction
- [x] Identity verification before order disclosure (customer legs)
- [x] Carrier leg explicitly exempt from identity verification, and forbidden
      from accepting a resolution on the customer's behalf
- [x] Safe wrong-code / wrong-person / decline / voicemail behaviour
- [x] E.164 enforcement
- [x] Duplicate call prevention
- [x] Irreversible actions require approval by default
- [x] **Order re-fetched and compared before mutation; aborts on drift** — was
      previously ticked with no re-fetch and no mutation
- [x] **Customer API validates the Shopify session token** — was previously
      ticked while the endpoint only checked that the header began with "Bearer"
- [x] Shop and customer identity taken from the token, never the request body
- [x] Secrets server-side only
- [x] Phone numbers, task text and transcripts encrypted at rest
- [x] Two independent switches required before any real call is placed
- [x] Compliance webhooks configured
- [ ] Transcript redaction — `transcriptRedacted` stores raw text

## Engineering

- [x] Migration works from zero
- [x] Seed works
- [x] Fixture provider works with no credential
- [x] Typecheck passes
- [x] Lint passes with zero warnings
- [x] Production build passes
- [x] 52 tests, verified non-vacuous by mutation testing
- [x] `.env.example` complete, with no dead keys
- [x] Architecture and integration documentation

## Deployment

- [ ] `.env` filled from `.env.example`
- [ ] `npm run verify:calle` passes
- [ ] One real call completed end to end
- [ ] `shopify app deploy`
- [ ] Customer-account extension enabled on the dev store
- [ ] Judge-reachable demo

## Submission

- [ ] 3-minute demo video, publicly visible
- [ ] Devpost description
- [ ] PR to `CALLE-AI/awesome-phone-call-agents`
- [ ] CALL-E account email provided
- [ ] Feedback survey (eligible for a separate prize)

## Demo

See `docs/DEMO_SCRIPT.md`. One order, two calls.

The carrier line in the demo is a stand-in that we control, and the video says
so out loud. Do not remove that disclosure.
