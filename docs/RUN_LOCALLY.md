# Run these on your Mac

Two things can only happen on your machine: Prisma's client can't be regenerated
in a Linux sandbox (its engine binary is platform-specific and the CDN is
blocked), and CALL-E's API isn't reachable from there either. So the migration
and the live-call verification are yours to run.

Everything else — typecheck, lint, production build — is already passing.

## 1. Migrate and regenerate

```bash
cd ~/LocalCode/callmemaybe
npx prisma migrate dev
npx prisma generate
```

This applies `20260803000000_add_third_party_call_target`, which adds the
recipient override columns to `CallPlan` and creates the `StuckOrder` table. The
SQL is already validated against a copy of your dev database.

**Expect 6 TypeScript errors to disappear here.** They're all "property does not
exist on PrismaClient" — stale generated types, nothing else. Confirm with:

```bash
npm run typecheck   # should be 0 errors
```

If anything other than those 6 appears, stop and send it to me.

## 2. Set the demo phone numbers

Both must be E.164 numbers **you control**:

```bash
# .env
DEMO_CARRIER_PHONE=+1...    # stand-in "carrier support" line
DEMO_CUSTOMER_PHONE=+1...   # stand-in customer
```

Do not point `DEMO_CARRIER_PHONE` at a real carrier's support number.

## 3. Seed

```bash
npx tsx prisma/seed.ts
```

Seeds Northstar Supply Co., the policy matrix including the two new issue types,
and three stuck orders. Order #1043 is the one with carrier context — that's the
demo thread.

## 4. Verify CALL-E

```bash
npm run verify:calle
```

Preflight only, places no call. It drives the app's real provider and real
schemas, so this is evidence about the shipping code path.

Reading the output:

- `PASS — authenticated (404 on unknown call id)` — credentials good.
- `FAIL credentials rejected` — the key is wrong or the wrong kind.
- `inconclusive: fetch failed` — network, not auth.

Then the live round trip, which uses one call credit:

```bash
npm run verify:calle -- --call +1YOURNUMBER
```

Answer it, talk to it, let it finish. You want to see a non-null structured
result and a populated event list at the end. **This is the moment the
submission becomes real** — until it passes, there's nothing to record.

## 5. Run it

```bash
shopify app dev
```

Open the app, go to **Outreach**, and you should see three blocked orders with
#1043 badged as a carrier dispute.

## Then

Ping me and we'll do the deploy together — I'll drive the Partner Dashboard
while you run the CLI, since I can't type into terminals.
