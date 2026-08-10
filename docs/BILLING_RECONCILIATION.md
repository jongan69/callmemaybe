# Billing and usage reconciliation

A billable unit is one CALL-E call whose canonical state is terminal
`COMPLETED`, normalized outcome is `COMPLETED`, and completion time is present.
A two-leg workflow consumes two units when both legs independently meet that
definition. Initiated, busy, no-answer, failed, canceled, or provider-error calls
consume zero units.

The ledger is unique by call attempt. A transaction-level advisory lock assigns
trial, included, or overage classification, and reserves the 2,250-call hard
ceiling. Included limits are 25 during trial and 250 in a paid cycle. Trial calls
do not reduce the first paid cycle. Overage uses the PII-free
`completed_call_overage` handle at $0.10 per unit and a permanent idempotency key.

Daily operations compare:

1. CALL-E canonical terminal calls.
2. Local completed-call attempts.
3. Local usage ledger entries and reversals.
4. Shopify accepted App Events.
5. Merchant-visible usage and projected charge.

Discrepancies stop additional billing retries for the affected entry, create an
incident, and are resolved by idempotent retry or an explicit negative reversal
event. Never edit accepted usage evidence manually. Cycle boundaries and active
entitlement are synchronized through the Partner API.
