# Devpost submission package

This file is the canonical copy deck for the live Devpost draft. Replace the two
clearly marked placeholders after recording and opening the community PR.

## Project name

CallmeMaybe

## Tagline

Call carriers and customers, then turn each conversation into an audited,
approval-gated Shopify order action.

## Description

### Inspiration

Small Shopify teams lose hours to work that has only one interface: a phone
number. A carrier marks a parcel delivered, but offers no useful exception API.
An order cannot ship, and the customer has stopped replying to email. Staff either
wait on hold or refund the order and absorb the loss.

CallmeMaybe treats phone as both the escalation channel when email stalls and
the API of last resort when the other organization has no integration.

### What it does

CallmeMaybe adds two phone workflows to Shopify:

- Carrier trace: CALL-E navigates the menu, waits on hold, reaches an agent,
  opens an investigation, and returns a schema-validated trace reference,
  disposition, promised response window, and hold time.
- Customer callback/outreach: CALL-E explains why the store is calling, verifies
  identity before sensitive disclosure, captures one clear decision, reads
  consequential details back, and records spoken confirmation.

The call never authorizes an order change. It produces evidence. A deterministic
policy engine evaluates that evidence, a merchant approves any Shopify mutation,
and the app re-reads the live order immediately before writing. If anything
drifted, execution stops and the audit trail explains why.

### How we built it

The app uses React Router 7 and Shopify App Bridge/Polaris web components for the
embedded merchant UI, plus customer-account and thank-you UI extensions. Shopify
Admin GraphQL 2026-07 supplies live orders, tracking, policy text, and mutations.
Prisma stores the case state machine, encrypted call plans/transcripts, policy
snapshots, idempotency receipts, and audit events.

CALL-E receives bounded task instructions and a strict per-issue JSON Schema.
Terminal webhooks are treated as untrusted notifications: the server deduplicates
them and re-fetches the canonical result from CALL-E before policy evaluation.

The safety path is deliberately model-free. Policy decisions are pure functions;
mutating automatic policies are defensively downgraded to approval; order
snapshot drift covers status, address, fulfillment quantities, line items, total,
currency, cancellation, and `updatedAt`.

### Challenges

The hardest part was not making a phone call—it was deciding what could safely
happen after one. We had to reconcile an asynchronous, probabilistic conversation
with a deterministic commerce system. That led to schema contracts, canonical
result re-fetching, idempotency at every boundary, transcript redaction, and the
re-read-before-write rule.

Carrier calls also require honest demo design. The video uses a stand-in line we
control, disclosed on screen and in narration, while exercising the same CALL-E
task and structured extraction as a carrier contact center.

### Accomplishments

- A working carrier workflow for phone trees, hold queues, agents, and package
  traces—not a generic voice-chat wrapper.
- A deterministic authorization boundary with no model in the decision path.
- Live Shopify order/tracking reads and validated current-version mutations.
- Authenticated shop/customer scoping, encrypted personal data, redacted display
  transcripts, retention controls, and all mandatory Shopify privacy webhooks.
- A full fixture provider for safe judging and 57 contract/regression tests.

### What we learned

Voice agents become substantially more useful when their output is treated like
evidence from an external system. Strict schemas, fresh state, explicit consent,
and human approval turn a clever call demo into a workflow a merchant could trust.

### What's next

Next are scheduled retry/backoff, automatic carrier-exception ingestion, a
managed SQL deployment for horizontal scale, and measured pilots with merchants
and carriers that consent to AI-assisted calls.

## Built with

CALL-E, Shopify, TypeScript, React Router, GraphQL, Prisma, SQLite, Preact,
Shopify App Bridge, Shopify Polaris web components

## Required form answers

- Submitter type: Individual
- App status: Newly created during the hackathon
- Updates to pre-existing app: “New project created for CALL-E: Your Code Is
  Calling; no pre-hackathon production product or user base.”
- Primary use case: Order / exception follow-up
- One-sentence task: “Call a carrier or customer about a blocked Shopify order,
  return structured evidence, and safely apply the merchant-approved resolution.”
- Testing instructions: Use the private reviewer URL supplied in the submission.
  In fixture mode, create a callback, copy the one-time code, then open the
  matching case in Shopify Admin to inspect the structured result, policy
  decision, redacted transcript, and audit trail. For the carrier workflow, open
  Outreach, choose a live order, expand carrier setup, and use the controlled
  stand-in number documented in the video.
- Community PR: https://github.com/CALLE-AI/awesome-phone-call-agents/pull/125
- Video: `PUBLIC_VIDEO_URL`
- CALL-E email, country, age/eligibility, and conflict declarations: enter the
  submitter's true information directly in Devpost; do not copy guesses from this
  file.
