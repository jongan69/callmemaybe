# Demo script — 3 minutes

One order. Two calls. That's the whole structure — resist adding a third thread.

## The story

Order #1043. Northline Freight marked it delivered on 28 July. Alex Johnson
replied to the delivery notification saying it never arrived, then stopped
answering email. Today it's sitting in the merchant's queue, twelve days old,
heading for a silent refund.

Nobody calls the carrier, because that's 25 minutes on hold for a $124 order.
So the merchant eats it.

CallmeMaybe calls the carrier. Then calls Alex back with the answer.

## Setup before recording

- `DEMO_CARRIER_PHONE` points at **a line you control**. Never a real carrier.
- `DEMO_CUSTOMER_PHONE` points at a second line you control.
- `CALL_PROVIDER=calle`, `CALLE_REAL_CALLS_ENABLED=true`.
- `npm run verify:calle` passes.
- Two phones on the desk, both visible in frame or on speaker.
- Have a person ready to answer the "carrier" line and play a support agent.
  Give them the IVR-then-agent routine: automated greeting, hold, then pick up.

**Say the stand-in out loud in the video, around 0:50.** One sentence:
*"That's a stand-in line I control, not a real carrier — same script, same
structured extraction."* Judges accept a transparent stand-in. They do not
forgive a silent fake, and a reviewer who spots it later will discount
everything else.

---

## 0:00–0:22 — The problem, with a number

*Merchant admin, Outreach page. Three stuck orders visible.*

> "Every Shopify merchant has this queue. Orders that can't ship, or that the
> carrier says arrived and the customer says didn't. Resolving one means sitting
> on hold with a carrier for twenty-five minutes over a hundred-dollar order. So
> nobody does it. They refund it and eat the loss."

Land on #1043. The badge says *Northline Freight says delivered · NL4820199317*.

## 0:22–0:40 — Why a phone call at all

> "This isn't a chatbot problem. The carrier has no API for a small shipper.
> The only interface is a phone number and a hold queue. And the customer has
> already ignored two emails, so email isn't the channel either."

*Click **Call Northline Freight**.*

## 0:40–1:25 — The carrier call

*Split screen: phone audio, and the case timeline updating.*

- Automated menu. CALL-E waits through it, picks the shipment option.
- Enters the tracking number.
- Hold.
- Agent picks up. CALL-E states it's an AI calling for Northstar Supply Co.
- Gives tracking number, asks for a package trace.
- Gets a trace reference. Reads it back to confirm.

> "It's navigating a phone tree, holding, and adapting to whatever the agent
> says. That's the part that can't be a form." *(stand-in disclosure here)*

## 1:25–1:50 — Structured result, leg one

*Case detail. The structured result panel.*

```
trace_opened          yes
trace_reference       NF-2291-4477
carrier_disposition   investigating
promised_response_by  "five to seven business days"
hold_time_minutes     11
```

> "Not a transcript summary — a schema CALL-E extracted and validated. Eleven
> minutes of hold time nobody had to sit through."

## 1:50–2:25 — The customer call

*Click **Call customer**.*

- Identifies the store and order number first, since Alex isn't expecting this.
- Six-digit code challenge before any order detail is disclosed.
- Reports what the carrier said.
- Confirms the resolution: reship to the same address.
- Reads the address back. Alex confirms out loud.

> "Now the customer gets an actual answer instead of silence, and the
> confirmation is captured as evidence, not a click."

## 2:25–2:50 — The policy gate

*Case detail: resolution proposal.*

- Policy: `CARRIER_TRACE` is APPROVAL, not automatic.
- Order re-fetched from Shopify and re-checked before anything executes.
- Merchant approves. Reship created. Both call legs in the audit trail.

> "The AI never authorises anything. It gathers evidence. A deterministic policy
> engine decides, the merchant approves, and every step is auditable."

## 2:50–3:00 — Close

> "Phone is the escalation channel when email stops working, and the API of last
> resort when the other side doesn't have one. CallmeMaybe puts a Shopify store
> on both — and turns what gets said into an audited order action."

---

## What to cut if you run long

In order: the third stuck order in the queue (0:15), the policy gate detail
(2:25–2:50 compresses to one line), the IVR navigation (jump straight to the
agent). Do **not** cut the stand-in disclosure or the structured result panel —
the first is honesty, the second is the entire technical claim.
