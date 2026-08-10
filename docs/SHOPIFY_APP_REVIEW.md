# Shopify App Store review evidence map

This map is a working aid, not a claim of Shopify approval. It must be refreshed
against the current requirements immediately before submission.

| Review area             | Repository evidence                                                                      | Release evidence still required                                          |
| ----------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| OAuth and embedded auth | `app/shopify.server.ts`, no manual shop form, production callbacks in `shopify.app.toml` | Branded deployed URLs and clean install/reinstall recording              |
| Necessary scopes        | `read_orders,write_orders,read_legal_policies`; no `read_customers`                      | Partner explanation and Level 2 field approval                           |
| Buyer extensions        | Session-token APIs derive shop/customer/order server-side                                | Released 2026-07 extension versions and browser rehearsal                |
| Consent and privacy     | Consent/suppression services, three privacy topics, encrypted queue                      | Counsel-approved text/DPA/retention and privacy request test evidence    |
| Calling safety          | Central eligibility, region defaults off, callback authentication                        | CALL-E/counsel approval for all 28 regions and controlled test lines     |
| Billing                 | Completed-call ledger, cap, retries/reversal, subscription sync                          | Matching App Pricing configuration and accepted test App Events          |
| Merchant actions        | Explicit approval plus order drift check                                                 | Reviewer demonstration of approval, rejection, and stale-order block     |
| Reliability             | Health routes, jobs/dead letters, Render blueprint, smoke/rollback docs                  | Live monitors, restore evidence, alerts, on-call contacts                |
| Listing                 | Listing and media specifications in `submission/`                                        | Dashboard fields, translated listings, signed-release screenshots/videos |
| Support                 | Public support/security/status routes                                                    | Branded mailboxes/status domain and response rehearsal                   |

Current external blockers are listed in
[`submission/EXTERNAL_APPROVALS.md`](../submission/EXTERNAL_APPROVALS.md).
