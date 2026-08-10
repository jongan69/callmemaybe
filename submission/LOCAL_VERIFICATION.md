# Local verification evidence

Date: 2026-08-10
Candidate: integrated `dev` working tree before commit; **not yet the merged
hackathon candidate**

This evidence confirms repository-level checks only. Replace it with CI links,
release SHA/image digest, deployed smoke-test results, and reviewer evidence from
the exact candidate before checking any box in `RELEASE_READINESS.md`.

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
- `npm run validate:repo`: 198 repository files passed the database-artifact,
  manifest, forbidden-scope, configuration, and current-file secret checks.
- `npm audit --audit-level=high --omit=dev`: zero vulnerabilities.
- Shopify CLI configuration validation reported no issues. `render.yaml` passes
  Render's current published JSON Schema, and CI/CodeQL workflow files parse as
  valid YAML. Render's workspace-aware semantic/conflict validation still
  requires the submitter to authorize the CLI and select a workspace.
- `git diff --check`: no whitespace errors.

## Not locally evidenced

- Docker was unavailable, so the production image build and Trivy scan must pass
  in GitHub Actions.
- Gitleaks and Trivy were unavailable locally; CI is configured to scan full Git
  history and the built image.
- The historic personal-looking test number remains in an old commit and must be
  assessed as exposed before release; it is absent from current scripts.
- Live Shopify install/reinstall, App Pricing, protected-data approval, CALL-E
  production routing, Render deployment, browser/accessibility/load tests,
  backup restore, localization, legal, and reviewer rehearsals remain hard gates.
- The public CALL-E community-list contribution is merged as
  `CALLE-AI/awesome-phone-call-agents#125`.
