# Three-minute demo script

The strongest recording is one real carrier-style call plus a fast tour of the
customer callback and safety boundary. Do not pretend both workflows are one
continuous case; they are two entry points into the same evidence → policy →
approval pipeline.

## Before recording

- Set `CALL_PROVIDER=calle` and `CALLE_REAL_CALLS_ENABLED=true` only for the
  recording window.
- Point `DEMO_CARRIER_PHONE` at a stand-in line you control. Never use a real
  carrier support number without permission.
- Run `npm run verify:calle`, then one private end-to-end rehearsal.
- Seed only if needed with `DEMO_SEED=true npm run seed`.
- Open these tabs in order: Outreach, the target case, Automations, and the
  token-protected customer demo.
- Put the stand-in phone on speaker and silence notifications everywhere else.
- Prepare a completed carrier case as a fallback so hold time cannot derail the
  recording.

Say this disclosure during the call segment: “This is a stand-in line I control,
not a real carrier; it runs the same CALL-E task and structured extraction.”

## 0:00–0:22 — The phone-shaped problem

Show the polished landing page, then Shopify Admin → Outreach.

> “A small Shopify team has two expensive gaps. A carrier has no useful exception
> API—only a phone tree and a hold queue. And when a customer stops answering
> email, the order stops moving. CallmeMaybe treats phone as the API of last
> resort and the escalation channel.”

## 0:22–0:48 — Start the carrier workflow

On a live recent order, expand carrier setup. Show tracking data prefilled, enter
the controlled phone, and click **Call carrier**.

> “The app reads the live order and tracking context from Shopify. CALL-E gets a
> bounded task and a strict result schema: open a trace, capture the reference,
> disposition, response window, and hold time.”

Show the phone ringing/answering. Include the stand-in disclosure. Cut the wait;
do not spend the demo listening to simulated hold music.

## 0:48–1:28 — The result is evidence

Open the completed case. Show the call timeline, structured result, and redacted
transcript.

> “This is not a free-form summary. CALL-E returned schema-validated evidence.
> The webhook only wakes the app; CallmeMaybe re-fetches the canonical result
> from CALL-E, so a forged webhook cannot invent an outcome.”

Point to `trace_reference`, `carrier_disposition`, `promised_response_by`, and
`hold_time_minutes` in the structured result.

## 1:28–2:02 — Show the safety boundary

Show the proposal and click **Approve & apply**. The carrier result writes an
auditable Shopify order note after approval.

> “The model never authorizes. A deterministic policy decides whether the result
> is eligible, and every Shopify mutation requires merchant approval. Immediately
> before writing, the app re-reads the order. Any status, address, item, quantity,
> total, cancellation, or update drift aborts execution.”

Show the success banner and audit event. If rehearsing against a disposable order,
make a harmless edit before approval once and capture the stale-state abort as an
optional picture-in-picture proof.

## 2:02–2:34 — Customer callback

Switch to the token-protected customer demo. Enter the recording phone, check the
explicit consent box, and request support. Show the six-digit code.

> “The second entry point is a customer-requested callback. The phone number comes
> from the signed Shopify order in the real customer extension. Sensitive details
> stay hidden until the customer gives the one-time code; the agent gets two
> attempts and never reads the code aloud.”

Briefly show the customer-account extension and the resulting case in Admin. A
second live call is optional; the carrier call already proves CALL-E execution.

## 2:34–3:00 — Close on product experience

Show Automations, Settings policy sync, and the overview in quick succession.

> “Merchants control each issue policy, sync their Shopify policy text, approve
> consequences, and keep an audit trail. Personal data is encrypted, the display
> transcript is redacted, and Shopify privacy requests are built in. CallmeMaybe:
> phone work for stores, safely resolved.”

Finish on the project cover or logo, not a terminal.

## Recording checklist

- 1080p or higher; zoom the browser to keep labels readable.
- Keep the final edit between 2:45 and 3:05.
- Add captions for every spoken line and on-screen labels for the two call legs.
- Show the CALL-E dashboard/call ID for two seconds as proof of the real call.
- Do not show API keys, access tokens, full phone numbers, customer email,
  unredacted transcripts, or the private demo token.
- Upload publicly to YouTube or Vimeo and verify it in a signed-out window.
