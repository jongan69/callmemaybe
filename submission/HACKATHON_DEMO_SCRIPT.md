# Hackathon demo script — target 2:50

Use one synthetic Shopify development-store order and two phone numbers
controlled by the submitter. Phone A is the disclosed carrier stand-in; Phone B
is the synthetic customer. Record the screen and speakerphone interaction first,
then add voice-over and captions.

## Before recording

- Confirm web and worker are on the merged `main` SHA and `/health/ready` is 200.
- Run the no-call preflight, then one private end-to-end carrier rehearsal.
- Prepare a completed synthetic carrier case as a fallback.
- Silence notifications and mask complete phone numbers, tokens, and customer data.
- Say: “This is a stand-in line I control, not a real carrier; it runs the same
  CALL-E task and structured extraction.”

## 0:00–0:25 — Problem and order context

Show the landing page, then Shopify Admin → Outreach and the synthetic order.
Explain that carriers and stalled customer conversations are phone-shaped gaps
for small merchants.

## 0:25–0:55 — Start the CALL-E carrier trace

Start the trace to Phone A. Explain the bounded task and strict result schema.
Show the controlled phone ringing and include the stand-in disclosure. Cut wait
time rather than simulating a carrier hold queue.

## 0:55–1:35 — Structured evidence

Open the completed case. Show the CALL-E call ID for two seconds, the timeline,
structured trace result, and redacted evidence. Explain that callbacks trigger a
canonical CALL-E re-fetch and cannot inject a fabricated result.

## 1:35–2:10 — Deterministic safety boundary

Show the policy proposal and approve the safe order-note action. Explain that the
model never authorizes a Shopify mutation and that the app re-reads the order
immediately before execution. Show the receipt and audit event.

## 2:10–2:35 — Customer callback entry point

Briefly show the customer extension using Phone B, explicit consent, attempt
limits, and single-use verification. A second live call is optional because the
carrier segment already proves CALL-E execution.

## 2:35–2:50 — Architecture and close

Show Settings/global stop control, then close on the logo, public repository,
and the web/worker/PostgreSQL architecture.

## Export gate

- 1080p, captions, 2:45–2:55 total duration.
- No secrets, full phone numbers, reusable codes, real PII, or private demo URLs.
- Upload to YouTube or Vimeo and verify playback while signed out.
