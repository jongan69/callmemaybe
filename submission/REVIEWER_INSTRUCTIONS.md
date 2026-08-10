# Shopify reviewer instructions

Complete every placeholder from the signed production release. Test these steps
in a clean incognito session before submission.

## Access

- Direct demo-store URL: `[REQUIRED]`
- Merchant reviewer login: `[REQUIRED]`
- Merchant password delivery method: `[REQUIRED — do not commit a password]`
- Buyer account URL: `[REQUIRED]`
- Buyer login: `[REQUIRED]`
- Buyer password delivery method: `[REQUIRED — do not commit a password]`
- Authorized customer test number ending: `[REQUIRED — last four only]`
- Verified carrier stand-in number ending: `[REQUIRED — last four only]`
- Enabled reviewer region/locale: `[REQUIRED]`
- Emergency developer email/phone: `[REQUIRED — enter in Partner Dashboard]`

## Expected walkthrough

1. Install CallMeMaybe from the review link. Confirm Shopify controls the install
   and OAuth flow and the app opens embedded without a manual shop-domain form.
2. Approve the $29 monthly plan. Confirm the 14-day trial and 25 completed-call
   trial allowance. A declined plan must leave calling disabled.
3. Accept the reviewed terms/DPA, set the synthetic business identity, choose the
   reviewer locale, and enable only the pre-approved reviewer region.
4. Open the synthetic order as the buyer. The call-consent control must be
   unchecked. Grant consent and note its two-attempt/seven-day/24-hour wording.
5. In the signed-in customer account, select a support subject and request the
   call for that exact order. Confirm the active consent and six-digit,
   short-lived support code are visible only in the authenticated buyer flow.
6. Enter the displayed code when the controlled line rings. Confirm the case
   becomes a redacted proposal in the merchant app; no order change occurs yet.
7. Approve the proposal. Confirm the app refreshes the order first. Repeat with a
   deliberately changed order and confirm the stale proposal is blocked.
8. Select the verified stand-in carrier number and approve the carrier leg.
   Confirm the result is a package-trace note/proposal, not an automatic refund,
   return, or replacement.
9. Open usage. Exactly one unit should appear for each independently completed
   call; controlled failed/no-answer test calls must add zero units.
10. Revoke buyer consent. A second customer placement must be blocked. Use the
    global stop switch and confirm carrier and customer placements are blocked
    while the app, privacy handling, and usage view remain available.
11. Exercise the supplied controlled failure scenarios: invalid callback,
    duplicate event, provider unavailable, and no-answer results must not create
    a proposal or usage charge. Production never uses the fixture provider.

## Reviewer notes

CALL-E is the disclosed call-processing integration. Test numbers are controlled
and synthetic; do not substitute a real customer or carrier. All Shopify order
data in the review store is synthetic. CallMeMaybe stores neither audio nor raw
transcripts. Contact the monitored support address if a provider call needs to be
reset during review.
