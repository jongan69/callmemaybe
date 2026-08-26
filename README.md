<p align="center">
  <img src="public/logo-lockup.svg" alt="CallMeMaybe" width="310" />
</p>

<p align="center"><strong>Consent-based AI phone support for Shopify orders.</strong></p>

<p align="center">
  <a href="docs/ARCHITECTURE.md">Architecture</a> ·
  <a href="docs/RUN_LOCALLY.md">Local setup</a> ·
  <a href="SECURITY.md">Security</a> ·
  <a href="devpost-submission.md">Hackathon submission</a> ·
  <a href="submission/HACKATHON_DEMO_SCRIPT.md">3-minute demo</a> ·
  <a href="submission/RELEASE_READINESS.md">Release readiness</a> ·
  <a href="submission/REVIEWER_INSTRUCTIONS.md">Reviewer walkthrough</a>
</p>

![CallMeMaybe feature artwork](public/devpost-cover.png)

CallMeMaybe lets a merchant call an approved carrier support line or respond to
a customer's explicit request for a call about a Shopify order. CALL-E handles
the conversation. CallMeMaybe turns the provider result into an auditable,
reason-coded proposal. Any Shopify mutation requires a merchant approval and a
fresh order-state check immediately before execution.

The public release target is a $29/month Shopify App Pricing plan with 250
completed calls, a 14-day/25-completed-call trial, $0.10 completed-call overage,
and an application-enforced $200 monthly overage ceiling. These terms are not
active until the matching Partner Dashboard configuration is approved and the
release checklist is signed.

## Safety model

- A customer call requires active, explicit, per-order consent. Creating a case
  cannot create or impersonate consent.
- Consent permits no more than two attempts in seven days, at least 24 hours
  apart. Revocation and spoken opt-out suppress retries immediately.
- A short-lived, single-use support code shown only in the authenticated
  customer account is required before order information may be disclosed.
- Carrier calls require merchant approval and an enabled endpoint with a
  completed official-number verification record.
- Every placement passes `CallEligibilityService`: entitlement, usage cap, kill
  switches, purpose, tenant/order/recipient consistency, region approval,
  locale, local calling window, suppression, consent, attempt/rate/concurrency
  limits, and identity capability.
- CALL-E callbacks require the secret callback path and a per-attempt nonce,
  reject duplicates and expired callbacks, and trigger a canonical provider
  refetch. A callback body is never treated as the final result.
- Busy, no-answer, failed, canceled, and provider-error calls are not billable.
  Exactly one usage entry is created only for a canonical terminal completed
  call with a completion timestamp.
- Returns, refunds, and replacements are captured as proposals for merchant
  action. The app does not automatically issue them.
- Address changes, cancellations, and order notes require explicit merchant
  approval. Order drift aborts execution.

## Production architecture

```text
Shopify embedded app + buyer extensions
                 │ authenticated requests/webhooks
                 ▼
       Render web service ──────► PostgreSQL
                 │                    │
                 └── pg-boss jobs ────┤
                                      ▼
                              Render worker
                              ├─ CALL-E placement/reconciliation
                              ├─ Shopify usage reporting
                              ├─ approved resolution execution
                              └─ privacy/retention jobs

Render cron ──► reconciliation, billing retry, subscription sync,
               retention, privacy processing, uptime heartbeat
```

PostgreSQL is the only production database. The disposable SQLite prototype is
not migrated or deployed. Sensitive call context, phone numbers, verification
codes needed for an active call, provider results, and privacy exports are
AES-256-GCM encrypted with versioned keys. Matching uses keyed hashes. Audio and
raw transcripts are not stored by CallMeMaybe.

## Repository map

```text
app/lib/regions.ts                     28-region and 12-locale registry
app/services/call-eligibility.server.ts central placement gate
app/services/consent.server.ts         grant/revoke/suppression rules
app/services/billing.server.ts         entitlement and usage ledger
app/services/support-case.server.ts    case, plan, placement, result lifecycle
app/services/resolution.server.ts      approval, drift check, mutation receipt
app/services/privacy.server.ts         export, redaction, retention
app/providers/                         fixture and CALL-E adapters
app/queue.server.ts                    PostgreSQL-backed jobs/dead letters
app/worker.server.ts                   isolated background workers
extensions/                            customer-account and order-status UI
prisma/                                PostgreSQL schema and baseline migration
submission/                            listing, media, reviewer, and gate package
```

## Local development

Requirements: Node 22.12, PostgreSQL 16+, a Shopify Partner development app and
store, and optional CALL-E sandbox credentials.

```bash
bun install --frozen-lockfile
cp .env.example .env
# Set DATABASE_URL and Shopify development credentials.
bun run setup
bun run dev
```

Fixture mode is the development default and places no call. Live calling
requires both `CALL_PROVIDER=calle` and `CALLE_REAL_CALLS_ENABLED=true`.
Production refuses fixture or ambiguous modes, missing callback authentication,
non-PostgreSQL databases, weak runtime secrets, dynamic third-party LLM task
generation, and non-official CALL-E origins. `bun run validate:release` applies
the additional gate selected by `RELEASE_TARGET`.

Use only a phone number you control:

```bash
TEST_CUSTOMER_PHONE=<AUTHORIZED_E164_NUMBER> bun run verify:calle
```

The verification command performs credential preflight without placing a call
unless its explicit `--call` option is supplied. Never point demo scripts at an
actual customer or carrier without documented authorization.

See [docs/RUN_LOCALLY.md](docs/RUN_LOCALLY.md) for the complete setup.

The fixture provider is the default and places no calls. Real calling requires
`CALL_PROVIDER=calle` **and** `CALLE_REAL_CALLS_ENABLED=true` — two independent
exact switches; invalid or ambiguous values fail closed.
Credentialed requests are pinned to the official `https://api.heycall-e.com`
origin; any other `CALLE_BASE_URL` is rejected before the client is created.

`DEMO_CARRIER_PHONE` must be a line you control. Never point it at a real
carrier's support number.

## Verification

```bash
bun run check
```

The command checks formatting, tests, types, lint, the production server build,
and both Shopify extensions. CI additionally applies the PostgreSQL migration to
an empty database, validates the seed registry, audits production dependencies,
scans secrets/SAST, and builds/scans the container.

## Release status

The active CALL-E hackathon package is
[devpost-submission.md](devpost-submission.md), with the
recording plan and final gate beside it. Repository readiness does not by itself
mean the external Devpost form, public video, or live deployment is complete.

Engineering completion is not the same as App Store approval. All 28 regions
default to disabled. Production submission remains blocked until the unchecked
items in [submission/RELEASE_READINESS.md](submission/RELEASE_READINESS.md) have
evidence, including legal/trademark review, protected customer data approval,
CALL-E production authorization for every region, human localization review,
the branded production domain and services, App Pricing configuration, final
signed-release media, reviewer credentials, backup restoration, and operational
sign-off.

The App Store checklist is a separate future release track and is not claimed by
the hackathon submission.

## License

MIT. See [LICENSE](LICENSE).
