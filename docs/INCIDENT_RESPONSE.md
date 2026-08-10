# Incident response

Severity P1 includes unauthorized or runaway calls, inability to stop calls,
cross-tenant exposure, protected-data leakage, missed privacy deletion, incorrect
usage charging at scale, or loss of merchant access. Target acknowledgement is
one hour.

1. Stop new calls with the app, shop, or region kill switch appropriate to the
   blast radius. Do not disable privacy or billing reconciliation.
2. Preserve non-PII correlation IDs, release tag, audit records, queue state,
   provider references, and Shopify event IDs. Never copy raw customer data into
   incident chat or tickets.
3. Contain credentials or access, rotate affected secrets/keys, and suspend the
   relevant worker when needed.
4. Reconcile provider terminal calls, usage events, mutations, suppressions, and
   privacy jobs before recovery.
5. Notify counsel, Shopify, merchants, CALL-E, Render, and affected individuals
   according to the approved incident matrix and contractual deadlines.
6. Restore in stages, monitor, complete a blameless review, and track corrective
   actions to closure.

Alert owners must exist for webhook failures, queue age/dead letters, call
failure spikes, billing backlog, provider authentication, database saturation,
privacy failures, and readiness/uptime. Quarterly exercises and monthly restore
tests are required initially.
