# Contributing

CallMeMaybe is a production Shopify app; changes should preserve the same
safety bar as production order automation.

## Local setup

1. Use the Node version in `.nvmrc`.
2. Run `bun install --frozen-lockfile`.
3. Copy `.env.example` to `.env` and keep fixture mode enabled.
4. Run `bun run setup` and, optionally, `bun run seed` with `DEMO_SEED=true`.
5. Start the Shopify development tunnel with `bun run dev`.

## Before opening a pull request

Run `bun run check`. Add a regression test for any change to schemas, policy,
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
