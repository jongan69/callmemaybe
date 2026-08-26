# CallMeMaybe customer-account extension

This extension adds three surfaces to Shopify customer accounts:

- an order action menu item for **Get phone support**;
- a full-page consent and issue-selection flow;
- a status block for the latest support case on an order.

Every API request includes a Shopify customer-account session token. The server
derives the shop/customer identity from that token and verifies live order
ownership; customer, phone, and order identity are never trusted from the
request body.

Run it with the parent app through `bun run dev`. Enable the targets in the
development store's customer-account editor. API version: 2026-07.
