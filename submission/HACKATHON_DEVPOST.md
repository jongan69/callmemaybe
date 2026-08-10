# CALL-E hackathon submission

This is the canonical Devpost copy deck for the hackathon candidate. Replace
only the explicitly marked truth fields after the merged commit, live URL, and
video have been verified. This package does not claim Shopify App Store
readiness.

## Project name

CallMeMaybe

## Tagline

Call carriers and customers, then turn each conversation into an audited,
approval-gated Shopify order action.

## Description

### Inspiration

Small Shopify teams lose hours to work that has only one interface: a phone
number. A carrier marks a parcel delivered but exposes no useful exception API.
An order cannot ship and a customer has stopped replying to email. Staff wait on
hold or refund the order and absorb the loss.

CallMeMaybe treats phone as both the escalation channel when email stalls and
the API of last resort when the other organization has no integration.

### What it does

CallMeMaybe adds two phone workflows to Shopify:

- Carrier trace: CALL-E navigates the menu, waits on hold, reaches an agent,
  opens an investigation, and returns a schema-validated trace reference,
  disposition, response window, and hold time.
- Customer callback: CALL-E explains why the store is calling, verifies identity
  before disclosing order details, captures one decision, reads consequential
  details back, and records spoken confirmation.

A call never authorizes an order change. It produces evidence. A deterministic
policy engine evaluates the evidence, a merchant approves any Shopify mutation,
and the app re-reads the live order immediately before writing. If the order has
drifted, execution stops and the audit trail explains why.

### How we built it

The app uses React Router 7, Shopify App Bridge, customer-account and thank-you
extensions, Admin GraphQL 2026-07, PostgreSQL, Prisma, and pg-boss. CALL-E
receives bounded task instructions and a strict issue-specific JSON Schema.
Terminal webhooks are notifications, not authority: the server authenticates
the callback path and nonce, deduplicates the event, and re-fetches the canonical
CALL-E result before policy evaluation.

Sensitive values are encrypted at rest with versioned keys. Phone matching uses
keyed hashes, merchant displays are redacted, and the background worker owns
placement, reconciliation, billing, resolution, and privacy jobs.

### Challenges

The hardest part was deciding what could safely happen after a probabilistic
conversation. That led to strict schemas, canonical result re-fetching,
idempotency at every boundary, deterministic authorization, and the
re-read-before-write rule.

Carrier calls also require honest demo design. The video uses a stand-in line
controlled by the submitter, disclosed on screen and in narration, while
exercising the same CALL-E task and structured extraction as the product path.

### Accomplishments

- Working carrier and customer phone workflows built on the official CALL-E SDK.
- Exact live-call gates and a production-only CALL-E credential origin.
- Deterministic policy decisions and approval-gated Shopify mutations.
- Tenant scoping, consent, suppression, encryption, retention, and privacy jobs.
- PostgreSQL-backed web/worker architecture with liveness and readiness checks.
- Contract and regression coverage across provider, policy, billing, privacy,
  queue, configuration, and order-drift behavior.

### What we learned

Voice agents become substantially more useful when their output is treated as
evidence from an external system. Strict schemas, fresh state, explicit consent,
and human approval turn a clever call demo into a workflow a merchant can trust.

### What's next

Next are measured pilots with consenting merchants and carriers, production
regional approvals, independent security/legal review, full localization
sign-off, branded infrastructure, and Shopify App Store review.

## Built with

CALL-E, Shopify, TypeScript, React Router, GraphQL, PostgreSQL, Prisma, pg-boss,
Shopify App Bridge, Shopify UI extensions, Render

## Required form answers

- Submitter type: Individual
- App status: Newly created during the hackathon
- Updates to pre-existing app: “New project created for CALL-E: Your Code Is
  Calling; no pre-hackathon production product or user base.”
- Primary use case: Order and exception follow-up
- One-sentence task: “Call a carrier or customer about a blocked Shopify order,
  return structured evidence, and safely apply the merchant-approved resolution.”
- Source: `PUBLIC_REPOSITORY_URL`
- Live app: `VERIFIED_RENDER_URL` — omit if the reviewer path is not stable.
- Community PR: https://github.com/CALLE-AI/awesome-phone-call-agents/pull/125
- Video: `PUBLIC_VIDEO_URL`
- Merged candidate: `MERGED_MAIN_SHA`
- CALL-E email, country, age/eligibility, and conflict declarations: enter the
  submitter's true information directly in Devpost; never infer these fields.

## Testing instructions

Use the development-store reviewer access supplied privately. Open Outreach,
choose the synthetic order, and start a carrier trace to the controlled stand-in
line shown in the video. The completed case displays the canonical structured
CALL-E result, redacted evidence, policy proposal, and audit trail. Approve the
safe order-note proposal and verify that Shopify reflects the action. The
customer callback uses the second controlled phone and a single-use verification
code. No real carrier or customer data is used.
