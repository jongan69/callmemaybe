# Local verification evidence

Date: 2026-08-10
Repository candidate under review:
`66e9537430192de64d66139daefdb065b31f4b4c`. It adds the Render repository
binding and this evidence update to application code merge
`33ffcd2fde5c3e4eb6c08bbe6955429b6f34e354` from
[`dev → main` PR #4](https://github.com/jongan69/callmemaybe/pull/4).

This evidence confirms repository-level checks only. Add the deployed service
SHA, smoke-test results, and reviewer evidence from the exact live candidate
before checking any live-environment or Devpost box. No deployed service SHA or
live smoke-test evidence exists yet, so all such boxes remain unchecked.

## Passing checks

- Clean `npm ci` from the lockfile completed with 827 packages.
- `npm run ci:verify`: formatting, 78 tests in 20 suites, typecheck, warning-free
  lint, production server build, and strict Shopify extension build passed.
- Shopify 2026-07 component validation:
  - `customer-account.order.action.render`: valid, artifact
    `callmemaybe-customer-support`, revision 6.
  - `purchase.thank-you.block.render`: valid, artifact
    `callmemaybe-order-support`, revision 3.
  - The other configured buyer-extension targets were validated earlier in the
    same audit and remained unchanged afterward.
- Empty PostgreSQL validation: the single production baseline migration applied,
  the production-safe seed created 28 disabled regional policies, all 12 locale
  codes validated, pg-boss queues initialized, and `/health/ready` reported all
  checks ready.
- The guarded hackathon seed refused a missing Shopify installation without
  enabling a region, then reused an existing synthetic shop ID, created its
  trial/carrier records, enabled only the US demo policy, and persisted no
  customer phone or order PII.
- `RELEASE_TARGET=hackathon npm run validate:release` passed against a complete
  production-shaped environment.
- `npm run validate:repo`: 201 repository files passed the database-artifact,
  manifest, forbidden-scope, configuration, and current-file secret checks.
- `npm audit --audit-level=high --omit=dev`: zero vulnerabilities.
- Shopify CLI configuration validation reported no issues.
- CALL-E credential and contract preflight authenticated successfully against an
  intentionally unknown call ID; no call was placed.
- Render CLI authentication and workspace selection succeeded. `render.yaml`
  passes Render's published schema and repository checks; its workspace-aware
  validation now reports only the expected `need_payment_info` gate for the
  three paid resources.
- `git diff --check`: no whitespace errors.
- Merged-`main` [CI run 31363233602](https://github.com/jongan69/callmemaybe/actions/runs/31363233602)
  passed the full verification job, complete-history Gitleaks scan, production
  image build, and blocking Trivy vulnerability/secret/misconfiguration scan.
- Merged-`main` [CodeQL run 31363233649](https://github.com/jongan69/callmemaybe/actions/runs/31363233649)
  passed.

## Not locally evidenced

- The historic personal-looking test number remains in an old commit and must be
  assessed as exposed before release; it is absent from current scripts.
- Live Shopify install/reinstall, App Pricing, protected-data approval, CALL-E
  production routing, Render deployment, browser/accessibility/load tests,
  backup restore, localization, legal, and reviewer rehearsals remain hard gates.
- The public CALL-E community-list contribution is merged as
  `CALLE-AI/awesome-phone-call-agents#125`.
