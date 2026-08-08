# Security policy

CallmeMaybe can initiate phone calls and propose Shopify order changes, so its
security model assumes that call output is untrusted evidence—not authority.

## Trust boundaries

- Shopify Admin routes require Shopify admin authentication and every database
  lookup is scoped to the authenticated shop.
- Customer-account routes verify Shopify session tokens and derive the shop,
  customer, and order ownership from signed claims and live Shopify data.
- CALL-E terminal webhooks use an unguessable callback path, are deduplicated,
  and trigger a canonical CALL-E API re-fetch. Webhook bodies are never trusted
  as the final result.
- The policy engine is deterministic and contains no model call. Any action that
  mutates Shopify is forced through merchant approval, even if a stored policy
  is accidentally configured as automatic.
- Immediately before a mutation, the app re-fetches the order and compares
  fulfillment, financial, cancellation, address, line-item, quantity, total,
  currency, and update state. Drift aborts execution.

## Data protection

- Phone numbers, task text, raw transcripts, and privacy exports use AES-256-GCM
  encryption at rest.
- Matching and deduplication use keyed hashes; verification codes are salted and
  hashed.
- The merchant UI only displays a transcript copy with contact, payment-number,
  verification-code, and exact collected-value redaction.
- Production refuses to encrypt or hash with development fallback secrets.
- Transcript retention is merchant-configurable. Expired transcripts and
  30-day privacy exports are purged during authenticated settings maintenance.
- Mandatory `customers/data_request`, `customers/redact`, and `shop/redact`
  webhooks are HMAC-authenticated. Customer exports are merchant-only downloads;
  redaction deletes the complete dependent case graph.

## Operational safeguards

- Fixture mode is the default and cannot place a call.
- Live calls require both `CALL_PROVIDER=calle` and
  `CALLE_REAL_CALLS_ENABLED=true`.
- The standalone reviewer demo additionally requires `DEMO_MODE_ENABLED=true`
  and a private `DEMO_ACCESS_TOKEN`; explicit call consent is required.
- Use a controlled stand-in number for carrier demos. Never aim an automated
  demo at a real carrier support line without permission.

## Supported versions and reporting

This hackathon build is maintained on the latest `main` branch. Please report a
vulnerability privately to the repository owner through GitHub Security
Advisories. Do not include credentials, phone numbers, transcripts, or customer
data in a public issue.
