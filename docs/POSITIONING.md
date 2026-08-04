# Positioning: answering "why does this need a phone call?"

The engineering is not the risk. The policy engine, case lifecycle, snapshot
re-checks, approval flow and audit trail are framing-independent and hold up.
The risk is the answer to one question a judge will ask in the first fifteen
seconds of the demo video.

## The objection

> The customer is signed into their Shopify account, looking at a screen, when
> they click "Get support." Why are you phoning them back to collect an
> apartment number they could type in five seconds?

For `ADDRESS_CHANGE` specifically, there is no good answer. A form is faster,
cheaper, unambiguous, and doesn't ring at dinner time. The judging criteria open
with:

> Does the project identify a real, specific phone-work problem … not a generic
> "AI that makes phone calls" concept.

"Phone-work problem" is the operative phrase. A phone call has to be doing work
that a screen can't. Below are the four framings that pass that test, ranked by
what they cost and what they buy.

---

## A. Call the carrier, not the customer

**The claim.** The expensive phone work in ecommerce isn't customer contact.
It's chasing third parties who only have a phone number.

**Concrete cases**

| Situation | What the merchant does today |
|---|---|
| Carrier marked delivered, customer never got it | Call UPS/FedEx/USPS to open a package trace. 15–40 min on hold. |
| Delivery exception after label creation | Address corrections at the carrier are phone-only for non-enterprise shippers. |
| Regional courier / white-glove scheduling | Many are phone-only, no API, no portal. |
| Dropship stock check before promising a date | Call the supplier. |
| Damaged freight claim | Phone intake. |

**Why it scores.**

- *Real World Impact.* The number is legible: 25 minutes of hold time per case,
  times the cases you get a week. Better, this is work small merchants currently
  **don't do at all** — they just refund and eat the loss because an hour of
  staff time costs more than the order. So the pitch isn't "save labor," it's
  "recover margin you're currently writing off." That's a stronger claim.
- *Quality of the Idea.* Almost every entry in this hackathon will be "AI calls
  your customer / lead / patient." Inverting it to "AI holds for the carrier"
  is the non-obvious move. It also lines up with CALL-E's own stated
  positioning — "low-frequency, personalized phone tasks that were previously
  too expensive or custom to automate" — and exercises the runtime features
  nobody else's demo will touch: hold, IVR navigation, transfers, screening.
- *Technical Implementation.* The structured extraction gets genuinely hard and
  therefore genuinely impressive: trace number, carrier disposition, promised
  callback date, claim eligibility. Real-time adaptation matters because you're
  navigating a phone tree, not talking to a cooperative human.

**The two-leg version is the strongest.** Customer reports non-delivery from
their order page → CallmeMaybe calls the carrier and opens a trace → CallmeMaybe
calls the customer back with the outcome and a policy-gated resolution. No
chatbot can do that. Both legs are CALL-E.

**Judge objections, and honest rebuttals**

- *"Carriers will block bots."* Legitimate risk. The call is placed on behalf of
  the account-holding shipper, with AI disclosure, and it's the same call a
  support rep would make. But don't overclaim production-readiness here.
- *"You can't demo this without actually calling UPS."* This is the real
  practical problem. Mitigation: call a stand-in carrier support line you
  control, and **say so in the video**. Judges accept a transparent stand-in.
  They do not forgive a silent fake.
- *"So it's a phone bot."* No — the output is a structured trace record written
  back to the Shopify order, gated by the existing policy engine, with the
  existing audit trail. The engine is the product; the call is the input.

**Cost.** One new issue type, one task template, one result schema, and a notion
of "call target ≠ customer." Policy engine, case model, approvals, snapshots,
audit: untouched. Estimate 2–4 hours.

---

## D. Proactive outreach on stuck orders

**The claim.** Phone is the escalation channel. That's why it still exists in
business at all.

The merchant has orders that physically cannot ship — incomplete address, failed
payment retry, out-of-stock item needing a substitution decision — and the
customer has ignored two emails. Email reply rates on those are dismal. The
order sits, ages, and eventually gets refunded.

**Why it scores.** It closes the objection cleanly: the customer is *not* at a
screen, and has already demonstrated that email doesn't reach them. The business
story is revenue recovery on orders that would otherwise be cancelled, which is
a better line than "saved a support ticket." And it's merchant-initiated, so the
merchant admin you already built becomes the primary surface rather than a
secondary one.

**Judge objection.** "Isn't an unsolicited call from a store annoying?" Answer
with the consent and policy model you already have, plus the fact that the
alternative outcome for the customer is a silently cancelled order.

**Cost.** Near zero code. The trigger moves from customer-initiated to
merchant-initiated; everything downstream is identical. Best effort-to-reward
ratio of the four.

---

## B. Voice authorization for irreversible actions

**The claim.** The value isn't collecting information, it's producing verified,
recorded, spoken authorization for actions that can't be undone — cancellations,
refunds, high-value returns.

**Why it scores.** It's the only framing that makes your existing
verification-code architecture the centerpiece rather than a supporting detail.
One-time code, `identity_status`, two-attempt limit, transcript retention — that
*is* this product. Zero new code; lead the demo with `CANCELLATION`.

**Judge objections, and honest rebuttals**

- *"Couldn't an SMS OTP do this for a cent?"* This is the sharp one. Possession
  of the phone is proven equally well by SMS. Your only real rebuttal is that
  the *content* of the authorization is captured — the customer states what
  they're authorizing in their own words and CALL-E extracts it as structured
  evidence. That's true, but it's a narrower win than A or D.
- *"Is voice confirmation actually legally stronger?"* It's evidentiary, not
  dispositive, and it varies by jurisdiction and card network. Don't overclaim.
- *A weakness worth knowing:* the customer is already authenticated in their
  Shopify account when you show them the code. So the code is proving
  possession of a phone you got from the order, to a person you already
  authenticated. Under this framing a judge may reasonably ask what the code
  adds.

**Cost.** Zero.

---

## C. Keep the current address-change framing

**Why you might.** It's built, demoed, documented, and shipping it risks
nothing.

**Why it's weak.** The "why not a form" objection is unanswerable for this
specific issue type. You'd be asking engineering quality to carry the
submission. That may be enough for an Honorable Mention. It is unlikely to win
either top prize, where the criterion's literal first sentence is about
identifying a real, specific phone-work problem.

---

## Recommendation

**D, then A if there's time.** D costs almost nothing and closes the objection
outright; A is the one that could win Most Practical or Most Innovative but
carries a demo-staging problem you'd need to solve honestly.

Framed together they're one coherent thesis, which is a better story than
either alone:

> Phone is the escalation channel when email fails, and the API of last resort
> when the other party doesn't have one. CallmeMaybe puts a Shopify store on
> both, and turns what's said into a policy-gated, audited order action.

Avoid C. B is a fine secondary talking point inside D or A — the verification
code and recorded confirmation are worth 15 seconds of demo time — but it's too
easy to answer with "just send an SMS" to carry the pitch on its own.
