# Run locally

## Prerequisites

- Node 22.12+ (the exact baseline is in `.nvmrc`)
- A Shopify Partner account and development store
- A CALL-E account only when testing real calls

## Safe fixture setup

```bash
nvm use
npm ci
cp .env.example .env
npm run setup
npm run check
npm run dev
```

Fixture mode is the default. Keep `CALL_PROVIDER=fake` and
`CALLE_REAL_CALLS_ENABLED=false`; no phone call can be placed.

The Shopify CLI opens a development tunnel, updates the application URL, and
guides installation on a development store. In Shopify Admin, open CallmeMaybe,
visit Settings once, then use Outreach with live recent orders.

## Optional demo data

The seed is deliberately guarded. Set these in `.env`:

```dotenv
DEMO_SEED=true
DEMO_SHOP_DOMAIN=your-dev-store.myshopify.com
DEMO_STORE_NAME=Northstar Supply Co.
DEMO_CARRIER_PHONE=+1_NUMBER_YOU_CONTROL
DEMO_CUSTOMER_PHONE=+1_NUMBER_YOU_CONTROL
```

Then run `npm run seed`. The command is idempotent and refuses to write anything
unless `DEMO_SEED=true`.

## Real CALL-E preflight

Set `CALLE_API_KEY` and run:

```bash
npm run verify:calle
```

That authenticates and validates the provider path without placing a call. One
explicit live round trip uses a call credit:

```bash
npm run verify:calle -- --call +1_NUMBER_YOU_CONTROL
```

Only after the preflight and rehearsal should both live gates be set:

```dotenv
CALL_PROVIDER=calle
CALLE_REAL_CALLS_ENABLED=true
```

If both gates are enabled but the provider is misconfigured, startup fails
loudly instead of silently switching to fixtures.

## Standalone reviewer page

The optional `/demo/customer` page is off by default. To enable it for a private
review link:

```dotenv
DEMO_MODE_ENABLED=true
DEMO_ACCESS_TOKEN=a-long-random-hex-value
```

Visit `/demo/customer?token=...`. The route returns 404 without both values,
requires explicit consent, and still obeys case deduplication and per-customer
call limits. Do not show the token in the video.

## Final verification

```bash
npm run check
npx prisma migrate status
npx shopify app config validate --json
npm audit --omit=dev
```
