# CallmeMaybe — Devpost submission packet

## Title

CallmeMaybe

## One-line summary

Call carriers and customers, then turn each conversation into an audited,
approval-gated Shopify order action.

## Problem

Small Shopify teams lose hours to work that still has only one interface: a
phone number. Carrier exceptions and stalled customer conversations force staff
to wait on hold, retry outreach manually, or refund orders without enough
evidence.

## Solution

CallmeMaybe adds two Shopify phone workflows:

- A carrier trace in which CALL-E navigates the phone tree, speaks with an
  agent, and returns a schema-validated trace reference, disposition, promised
  response window, and hold time.
- A consent-based customer callback in which CALL-E verifies identity before
  sensitive disclosure, captures one decision, reads consequential details
  back, and records spoken confirmation.

A call produces evidence; it never authorizes an order mutation. A deterministic
policy engine evaluates the evidence, a merchant approves any consequential
action, and the app re-reads the live Shopify order immediately before writing.
If the order changed, execution stops and records why.

## Why this matters

Voice agents are useful when they close gaps that APIs and email cannot. The
project makes phone automation operationally credible by separating the
probabilistic conversation from deterministic authorization, consent, and audit
controls.

## How AI capabilities are used

CALL-E receives bounded task instructions and an issue-specific JSON Schema,
places the carrier or customer call, adapts the conversation in real time, and
returns structured evidence. Terminal webhooks are treated as untrusted
notifications: the server authenticates and deduplicates them, then fetches the
canonical CALL-E result before evaluation. No model decides whether Shopify may
be mutated.

## How Codex was used

Codex helped turn the original concept into the application architecture,
implement the CALL-E and Shopify paths, add safety and privacy gates, write
focused regression tests, investigate security findings, migrate the project to
Bun, validate CI and CodeQL, and prepare the repository, demo plan, and Devpost
materials. Human-controlled values such as eligibility declarations, account
email, phone authorization, and final submission approval are intentionally not
inferred by Codex.

## Key features

- CALL-E carrier trace and customer callback workflows.
- Strict structured-result schemas and canonical result re-fetching.
- Explicit consent, suppression, quiet-hour, and attempt-limit controls.
- Deterministic policy decisions and merchant-approved Shopify actions.
- Fresh-order drift checks immediately before mutation.
- Tenant scoping, encrypted sensitive values, redacted displays, retention, and
  privacy jobs.
- Fixture provider for safe local judging without placing real calls.
- PostgreSQL-backed web and worker architecture with health endpoints.

## Architecture summary

The embedded app uses React Router 7, React, Shopify App Bridge, customer-account
and thank-you extensions, and Shopify Admin GraphQL. PostgreSQL, Prisma, and
pg-boss persist cases, jobs, consent, policy snapshots, idempotency receipts,
and audit events. The CALL-E TypeScript SDK is isolated behind a provider
adapter; fixture mode exercises the same downstream contracts without dialing.

## Testing instructions

The public repository is the judge-accessible test build. Node 22.12,
Bun 1.3.14, PostgreSQL 16+, a Shopify Partner development app, and a development
store are required for the interactive embedded flow.

```bash
git clone https://github.com/jongan69/callmemaybe.git
cd callmemaybe
bun install --frozen-lockfile
cp .env.example .env
```

Set a dedicated PostgreSQL `DATABASE_URL` and Shopify development credentials.
Leave these safe defaults unchanged:

```dotenv
NODE_ENV=development
CALL_PROVIDER=fixture
CALLE_REAL_CALLS_ENABLED=false
BILLING_BYPASS_DEVELOPMENT=true
```

Generate the two local secrets documented in `.env.example`, then run:

```bash
bun run setup
bun run dev
```

For a credential-free code-path check that places no phone call:

```bash
bunx prisma generate
bun run test
```

Do not enable the CALL-E provider or use a phone number unless the operator owns
the number or has written permission to call it. The full setup and safety notes
are in `docs/RUN_LOCALLY.md`.

## Screenshot shot list

1. Merchant overview with provider and setup status.
2. Outreach flow selecting a synthetic order and carrier trace.
3. Completed case with redacted structured CALL-E evidence.
4. Deterministic policy proposal and merchant approval.
5. Shopify action receipt and audit timeline.
6. Customer callback consent and single-use verification.

## Demo video outline

The recovered checkout does not contain Shopify credentials, an installed demo
store, or authorized test numbers. The honest 2:04 technical walkthrough
therefore places no call and makes no live-deployment claim:

1. Introduce the blocked-order problem and CallmeMaybe outcome.
2. Show the public project overview and source repository.
3. Walk through the CALL-E provider boundary and structured-result path.
4. Explain the deterministic policy, merchant approval, and fresh-order checks.
5. Show the green hosted CI/CodeQL evidence.
6. Show the reviewed and merged CALL-E community contribution.
7. Close with the controlled-pilot requirements.

## Verified links

- Repository: https://github.com/jongan69/callmemaybe
- Public project overview: https://pages.jongan.com/callmemaybe/
- Required CALL-E community contribution:
  https://github.com/CALLE-AI/awesome-phone-call-agents/pull/125
- Current Devpost project: https://devpost.com/software/callmemaybe
- Demo video: **TODO — generated locally and awaiting public YouTube/Vimeo
  upload**
- Functional hosted app: omitted; the Render/Shopify environment is not
  currently evidenced as available to judges.

## Official form fields

- Submitter Type: `Individual`
- Country of residence/incorporation: **TODO — submitter must provide**
- Organization name: omit
- App status: `Newly created`
- If pre-existing, explain what you updated: `New project created during the
CALL-E: Your Code Is Calling submission period; there was no pre-hackathon
production product or user base.`
- Testing instructions: use the instructions above
- Optional functional demo URL: omit
- Project submission pull request URL:
  `https://github.com/CALLE-AI/awesome-phone-call-agents/pull/125`
- Email address associated with the CALL-E account: **TODO — submitter must
  provide**
- Primary use case: `Order / exception follow-up`
- One-sentence task: `Call a carrier or customer about a blocked Shopify order,
return structured evidence, and safely apply the merchant-approved
resolution.`
- Eligible Age: **TODO — submitter must explicitly confirm**
- Country eligibility: **TODO — submitter must explicitly confirm**
- Conflict of interest: **TODO — submitter must explicitly confirm**

## Draft readiness notes

- Verified: public repository, latest `main` commit, green hosted CI/CodeQL,
  public landing page, merged required community PR, local secret-pattern scan,
  and valid Shopify app configuration.
- Fixed locally: stale npm-based judge instructions and broken landing-page
  asset/document links.
- Generated locally: a 2:04, 1280×720 H.264/AAC technical walkthrough with SHA-256
  `f4dc9b31a3920e2c2c94aa5b66f57db3d9109cb339ec58a7f69b02b338d17cb1`.
- Required before final Devpost submission: upload the video publicly and supply
  the CALL-E account email, country, and explicit eligibility/conflict answers.
- Verified on the public Devpost page: the project already has a thumbnail.
- No claim is made that the separate Shopify App Store or production deployment
  gates are complete.
