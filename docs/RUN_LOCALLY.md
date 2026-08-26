# Run locally

## Requirements

- Node.js 22.12.x (see `.nvmrc`)
- PostgreSQL 16+
- Shopify Partner development app and development store
- Shopify CLI authenticated to the development app
- Optional CALL-E account and a phone number you control

## Setup

```bash
bun install --frozen-lockfile
cp .env.example .env
```

Create a dedicated local PostgreSQL database and set `DATABASE_URL`. Fill the
Shopify development credentials and keep:

```dotenv
NODE_ENV=development
CALL_PROVIDER=fixture
CALLE_REAL_CALLS_ENABLED=false
BILLING_BYPASS_DEVELOPMENT=true
```

Generate a 32-byte encryption key and a long independent hash pepper using the
commands documented in `.env.example`. Then:

```bash
bun run setup
bun run dev
```

`bun run setup` generates Prisma, applies the PostgreSQL migration, seeds the 28
disabled-by-default regional records, and does not create demo customers unless
`DEMO_SEED=true` is explicitly set.

## CALL-E verification

Set `CALL_PROVIDER=calle`, `CALLE_REAL_CALLS_ENABLED=true`, a CALL-E key, the
exact `https://api.heycall-e.com` origin, a public Shopify app URL, and a 32+
character callback token. `bun run verify:calle` validates credentials without
placing a call. The credentialed client intentionally rejects the test origin
and every other configurable host.

To place a test, use the command's explicit `--call` option and only an E.164
number you own or have written permission to call. `TEST_CUSTOMER_PHONE` and
`TEST_CARRIER_PHONE` are available to the two targeted scripts; no phone number
is tracked in the repository.

## Verification

```bash
bun run check
```

This runs formatting, unit/integration tests, typecheck, lint, the production
server build, and every extension build. CI additionally provisions an empty
PostgreSQL database, applies the baseline, validates seed counts/defaults, runs
dependency and secret/SAST checks, and scans the built container.

## Production warning

Do not copy the development `.env` into production. Production validation
refuses fixtures, billing bypass, missing callback authentication, weak keys,
non-PostgreSQL databases, or non-official provider origins. Run
`bun run validate:release` with the intended `RELEASE_TARGET` for the additional
hackathon or Shopify App Store gate. All regional records remain disabled until
separately approved or explicitly enabled by the guarded isolated-demo seed.
