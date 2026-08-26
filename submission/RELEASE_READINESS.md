# Release-readiness checklist

Owner: `[REQUIRED]`
Candidate tag/image digest: `[REQUIRED]`
Target submission date: `[REQUIRED]`
Evidence folder: `[REQUIRED]`

This is the single authoritative go/no-go checklist. An item is complete only
when it links to evidence from the exact signed candidate. The all-region,
all-language release scope means any unchecked hard gate is a submission stop.

## 1. Engineering and repository

- [ ] Branch-protected release PR has required reviews and all CI checks green.
- [ ] `bun run check` passes with zero server or extension warnings.
- [ ] Empty PostgreSQL migration and production-safe seed validation pass.
- [ ] Dependency, license, secret, SAST, and container scans have zero high or
      critical findings or an approved, documented exception.
- [ ] No secret, personal number, tracked database, raw transcript, or PII is in
      current tracked files/log fixtures. Historic exposed values have been
      assessed and rotated/notified as required.
- [ ] Fixture, unknown, ambiguous, missing-webhook, weak-key, non-PostgreSQL, and
      incomplete production configurations all fail startup.
- [ ] All call entry points have a persisted `CallEligibilityDecision`.
- [ ] Callback spoof, expiry, nonce mismatch, replay, duplicate, out-of-order,
      missed webhook, and reconciliation cases pass.
- [ ] A no-answer/failed call creates zero usage; a canonical completed call
      creates exactly one unit; a two-leg completion creates exactly two.
- [ ] Trial, active, decline, frozen, cancel, uninstall/reinstall, rollover,
      rejection/retry/reversal, duplicate event, and 2,250-call cutoff pass.
- [ ] Consent grant, expiry, revocation, spoken opt-out, suppression, wrong
      order/customer, quiet hours, attempt spacing/limit, and disabled region pass.
- [ ] Verification code valid, invalid, expired, reused, and cross-shop cases pass.
- [ ] Carrier number must be official, enabled, verified, and merchant approved.
- [ ] Cross-tenant authorization tests cover every API and queued job.
- [ ] Concurrent approval, order drift, idempotent mutation, and provider partial
      failure cases pass.
- [ ] Privacy export/redaction, uninstall cleanup, retention, key rotation, and
      encrypted backup restore pass.
- [ ] Chrome, Safari, Firefox, mobile widths, embedded admin, customer account,
      order status, keyboard, screen reader, contrast, focus, and reduced motion
      pass with zero uncaught UI errors or happy-path network failures.
- [ ] Webhook burst, queue concurrency, billing backlog, and provider degradation
      load tests meet the recorded release thresholds.

## 2. Infrastructure and operations

- [ ] Development, staging, and production Shopify/CALL-E/Render/PostgreSQL
      environments and secrets are completely separate.
- [ ] Production uses a branded HTTPS app domain and exact OAuth/webhook/public
      policy URLs; `shopify.app.toml` matches the deployed candidate.
- [ ] Web, worker, cron, and managed PostgreSQL are healthy and independently
      deployable; `/health/live` and `/health/ready` are monitored.
- [ ] PostgreSQL TLS, encryption at rest, backups, PITR, saturation alerts, and a
      successful restore test are evidenced.
- [ ] Sentry has `sendDefaultPii=false`, tested redaction, release tags, and alerts.
- [ ] Better Stack uptime and public branded status page are live.
- [ ] Alerts cover webhook failures, queue age/dead letters, call failures,
      billing backlog, provider auth, database saturation, and privacy failures.
- [ ] Backup-before-migration, immutable promotion, smoke test, kill switch, and
      rollback runbooks were rehearsed.
- [ ] Staff MFA, least privilege, production access audit, break-glass process,
      incident contacts, and P1 exercise are signed by operations/security.

## 3. Legal, privacy, vendor, regional, and localization

- [ ] Every item in `EXTERNAL_APPROVALS.md` is complete and linked.
- [ ] Every language row in `LOCALIZATION_SIGNOFF.md` is signed.
- [ ] Privacy, Terms, DPA, Calling Policy, Security, support, and status pages are
      counsel-approved, localized as required, and publicly reachable.
- [ ] Level 2 protected customer data and exact order fields are approved before
      App Store review; no unapproved field or `read_customers` scope is used.
- [ ] CALL-E is contractually the only production AI processor of call content;
      audio is not stored and transcript retention satisfies the signed terms.
- [ ] All 28 region policies have real legal/vendor references, approved caller
      IDs, locale/script evidence, effective dates, and tested kill switches.
- [ ] Trademark and domain clearance for CallMeMaybe is signed.

## 4. Shopify and billing configuration

- [ ] Partner business identity, emergency email/phone, distribution, categories,
      merchant eligibility, integration disclosure, and sender allowlist are set.
- [ ] App Pricing is exactly $29/month, 250 completed calls, $0.10 overage, 14-day
      trial with 25 calls, and `completed_call_overage` event handle.
- [ ] Warning banners/emails at 80%, 90%, and 100% included usage and overage cap
      are exercised in production-like staging.
- [ ] Active Subscription synchronization and all entitlement states are proven.
- [ ] Customer-account/order-status extensions are released on the target API
      version and free of pricing/promotional/duplicated/unsupported content.
- [ ] Partner Dashboard automated checks pass with no warnings.

## 5. Listing and reviewer package

- [ ] `APP_STORE_LISTING.md` matches visible behavior and is legally approved.
- [ ] Icon, feature image, and six unique screenshots pass `MEDIA_CHECKLIST.md`.
- [ ] Human-reviewed listing translations and alt text are entered for every
      available target Partner Dashboard locale.
- [ ] Marketing video and separate English reviewer screencast are from the exact
      signed candidate and cover installation, billing, onboarding, consent, both
      legs, verification, approval/drift, usage, failures, opt-out, and revocation.
- [ ] Direct demo-store URL, synthetic orders, buyer/merchant reviewer access,
      controlled phones, and exact steps in `REVIEWER_INSTRUCTIONS.md` work.
- [ ] Credentials provide full feature access, do not expire during review, and
      are delivered securely outside git.
- [ ] Support inbox, status page, production services, reviewer data, and CALL-E
      capacity will remain stable and monitored throughout review.
- [ ] Two independent reviewers who did not build the feature completed the full
      walkthrough in incognito and signed the evidence.

## 6. Final sign-off

| Discipline                 | Name | Evidence | Date | Approved |
| -------------------------- | ---- | -------- | ---- | -------- |
| Engineering                |      |          |      | [ ]      |
| Security/privacy           |      |          |      | [ ]      |
| Legal/trademark            |      |          |      | [ ]      |
| CALL-E/vendor              |      |          |      | [ ]      |
| Localization               |      |          |      | [ ]      |
| Operations/support         |      |          |      | [ ]      |
| Product/reviewer rehearsal |      |          |      | [ ]      |

Submission owner decision: `[NO-GO until every box above is complete]`
