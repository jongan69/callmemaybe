# Shopify App Store self-review

Review date: 2026-08-08. Source: Shopify's live AI self-review requirements,
checked with the Shopify AI Toolkit against this repository.

## Applicable requirements

| Requirement | Result | Evidence |
|---|---:|---|
| 1.1.1 Session-token authentication | Pass | Embedded admin uses Shopify authentication; customer APIs verify customer-account session tokens and scope every lookup. |
| 1.1.4 Factual information | Pass | No fabricated storefront metrics, reviews, purchases, or sales claims. Fixture data is confined to explicitly labeled demo mode. |
| 2.2.1 Shopify APIs | Pass | Orders, tracking, policies, notes, cancellation, and address changes use Shopify Admin GraphQL. |
| 2.2.3 Latest App Bridge | Pass | Current Shopify React Router template and App Bridge web components. |
| 2.2.4 GraphQL Admin API | Pass | No Admin REST calls. All operations validated against API 2026-07. |
| 2.3 Installation/authentication | Pass in Shopify CLI flow | OAuth and embedded redirect behavior come from the official Shopify React Router package. |
| 3.1.1 TLS | Deployment gate | Replace the placeholder production URL with the final HTTPS host before App Store submission. Shopify CLI tunnels satisfy development only. |
| 3.2 Necessary scopes | Pass | `read_orders,write_orders,read_customers,read_legal_policies`; no `read_all_orders`, payment, product-write, or checkout-chat scope. |
| 5.6.2/5.6.3 Checkout promotion | Pass | Thank-you extension contains store support guidance only, with no app promotion, ads, reviews, or external link. |
| 5.6.5 Checkout total consent | Not applicable | The extension cannot modify cart lines, charges, discounts, or totals. |
| 5.6.6 Countdown timers | Pass | None. |
| 5.6.7 Chat UI | Not applicable | The app does not request `read_checkout_extensions_chat` or implement checkout chat. |
| 5.6.9 Payment information | Pass | No payment fields or payment collection. |
| Mandatory privacy webhooks | Pass | Authenticated data request export, customer redaction, and full shop redaction are configured in `shopify.app.toml`. |

## Pre-App-Store deployment gates

These do not block the hackathon submission, but must be completed before a
public Shopify App Store review:

1. Deploy to a stable HTTPS origin and replace `application_url` and auth URLs.
2. Add public privacy-policy, terms, and support URLs to the Shopify listing.
3. Choose a billing model. If the app is paid, implement Shopify App Pricing or
   the Billing API; if free, state that clearly.
4. Provide reviewer credentials/instructions and enable both extensions on the
   review store.
5. Trigger each compliance webhook and capture its 200 response plus redaction
   evidence in a disposable review database.

No category-specific payment, sales-channel, subscription, product-sourcing,
post-purchase upsell, donation, or mobile-app-builder requirements apply.
