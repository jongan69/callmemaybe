# Shopify App Store pre-submission review

Generated on 2026-08-09 from Shopify's live AI self-review requirements fetched with `shopify doc fetch`. This is a source review, not a substitute for the Partner Dashboard automated checks or Shopify's review.

## Summary

✅ **Likely passing:** 32
❌ **Likely failing:** 0
⚠️ **Needs review:** 5
⏭️ **Groups skipped:** 9 _(see below)_

**Note:** The agent has reviewed a subset of requirements that have been selected by Shopify as checkable against a local codebase without browser context. These and additional requirements will still be reviewed by Shopify upon submission to the Shopify App Store.

## ⚠️ Requirements that need review

⚠️ **1.2.1 Use Shopify App Pricing or the Shopify Billing API**

**Why this needs attention:** Shopify App Pricing configuration lives in the Partner Dashboard and cannot be confirmed from source alone. Verify that the live public app has exactly the approved $29 plan and App Event overage terms, with no off-platform merchant billing.

**What was detected:** The app contains App Pricing entitlement synchronization, usage-ledger, and Shopify App Event reporting code and no external billing provider. Dashboard configuration is intentionally an unchecked release gate.

⚠️ **1.2.2 Implement Shopify App Pricing or the Shopify Billing API correctly**

**Why this needs attention:** Approval, decline, frozen, cancellation, trial, and reinstall behavior must be exercised against the real Partner Dashboard configuration and a reviewer store.

**What was detected:** Source handles the subscription lifecycle and blocks calls without entitlement, but a live pricing approval/decline/reinstall rehearsal has not been evidenced.

⚠️ **2.3.2 Authenticate immediately after install**

**Why this needs attention:** The initial install redirect and OAuth handshake require browser verification against the production Shopify app.

**What was detected:** Embedded routes call `authenticate.admin`, use Shopify's React Router app package, and no manual shop-domain installation form exists. The deployed install entry point has not been rehearsed from a fresh store in this review.

⚠️ **2.3.3 Redirect to the app UI after installation**

**Why this needs attention:** The final OAuth callback destination must be verified in a browser after accepting scopes.

**What was detected:** Shopify's framework authentication handler and embedded `/app` UI are present, while the final production callback and Partner Dashboard URLs remain a deployment/rehearsal gate.

⚠️ **2.3.4 Require OAuth authentication immediately after reinstall**

**Why this needs attention:** Reinstallation with prior shop records and revoked sessions requires a live uninstall/reinstall test.

**What was detected:** Sessions use Shopify's Prisma session storage and protected app routes authenticate on each request. No live reinstall evidence is available from the codebase.

## ❌ Requirements that are likely failing

No locally checkable requirement is currently assessed as likely failing. The five items above remain submission gates until verified in the production Partner configuration and reviewer store.

## Skipped groups

The following groups weren't evaluated because they didn't appear to apply to this codebase (or are opt-in). If you'd like these checked anyway, they can be reviewed separately.

- **5.1 Online store** — No theme app extension detected.
- **5.2 Payment** — No payment extension or payment-gateway scopes detected.
- **5.3 Payment facilitator** — Opt-in only; not requested.
- **5.4 Purchase option** — No purchase-option or payment-mandate scopes detected.
- **5.5 Product sourcing** — Opt-in only; not requested.
- **5.7 Sales channel** — No sales-channel extension detected.
- **5.8 Post purchase** — No `checkout_post_purchase` extension detected; the thank-you UI extension is not a post-purchase upsell extension.
- **5.9 Mobile app builders** — Opt-in only; not requested.
- **5.10 Donation** — Opt-in only; not requested.

## Resources

- [App Store requirements documentation](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)
- [Best practices for apps](https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices)
- [About billing for your app](https://shopify.dev/docs/apps/launch/billing)
- [Submitting your app for review](https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review)
