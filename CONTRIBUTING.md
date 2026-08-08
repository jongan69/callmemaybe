# Contributing

CallmeMaybe is a compact hackathon project, but changes should preserve the same
safety bar as production order automation.

## Local setup

1. Use the Node version in `.nvmrc`.
2. Run `npm ci`.
3. Copy `.env.example` to `.env` and keep fixture mode enabled.
4. Run `npm run setup` and, optionally, `npm run seed` with `DEMO_SEED=true`.
5. Start the Shopify development tunnel with `npm run dev`.

## Before opening a pull request

Run `npm run check`. Add a regression test for any change to schemas, policy,
provider normalization, order snapshots, authorization, or redaction.

Never weaken these invariants:

- model output cannot authorize a mutation;
- customer resources are scoped to the signed Shopify identity;
- mutating actions require merchant approval;
- Shopify state is re-read immediately before write;
- real calls require both server-side gates;
- secrets and raw personal data do not enter browser bundles, fixtures, logs, or
  commits.

For Shopify platform work, use the Shopify AI Toolkit and validate Admin GraphQL
operations against the pinned API version before committing.
