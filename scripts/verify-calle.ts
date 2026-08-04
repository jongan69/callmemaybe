/**
 * CALL-E integration verification.
 *
 * This exercises the app's own CallePhoneSupportProvider and its real task
 * template and result schema, so a pass here is evidence that the shipping
 * code path works against the live CALL-E API, not that a toy script does.
 *
 *   npx tsx scripts/verify-calle.ts
 *       Preflight only. Checks credentials and contract wiring. Places NO call.
 *
 *   npx tsx scripts/verify-calle.ts --call +15551234567
 *       Places ONE real outbound call and waits for the terminal result.
 *       This consumes one of your CALL-E call credits.
 */

import { CallePhoneSupportProvider } from "../app/providers/calle-provider.server";
import { buildTaskTemplate, getResultSchema } from "../app/lib/call-plan";
import type { OrderSnapshot } from "../app/lib/types";

const args = process.argv.slice(2);
const callFlagIndex = args.indexOf("--call");
const phone = callFlagIndex >= 0 ? args[callFlagIndex + 1] : undefined;
const issueType = "ADDRESS_CHANGE";

function line(label: string, value: unknown) {
  console.log(`  ${label.padEnd(26)} ${String(value)}`);
}

const DEMO_SNAPSHOT: OrderSnapshot = {
  orderId: "gid://shopify/Order/verification",
  updatedAt: new Date().toISOString(),
  financialStatus: "paid",
  fulfillmentStatus: "unfulfilled",
  cancelledAt: null,
  shippingAddressHash: null,
  fulfillmentHash: "verification",
  lineItemHash: "verification",
  totalMinor: 8400,
  currencyCode: "USD",
  capturedAt: new Date().toISOString(),
};

async function main() {
  console.log("\nCALL-E integration verification\n");

  // ── 1. Credentials ────────────────────────────────────────
  if (!process.env.CALLE_API_KEY) {
    console.error(
      "FAIL  CALLE_API_KEY is not set. Add it to .env and re-run with:\n" +
        "      node --env-file=.env node_modules/.bin/tsx scripts/verify-calle.ts",
    );
    process.exit(1);
  }
  line("CALLE_API_KEY", `set (${process.env.CALLE_API_KEY.slice(0, 6)}…)`);
  line("CALLE_BASE_URL", process.env.CALLE_BASE_URL ?? "(SDK default)");

  const provider = new CallePhoneSupportProvider();
  line("provider", "CallePhoneSupportProvider constructed");

  // ── 2. Auth probe ─────────────────────────────────────────
  // Reading a call id that cannot exist proves the key authenticates: a bad
  // key returns 401, a good key returns 404. No call is placed either way.
  console.log("\nAuth probe (no call placed)");
  try {
    await provider.getCall("call_verification_probe");
    line("result", "unexpected success — probe id resolved");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("401") || message.includes("403")) {
      console.error(`FAIL  credentials rejected: ${message}`);
      process.exit(1);
    }
    if (message.includes("404") || message.includes("not_found")) {
      line("result", "PASS — authenticated (404 on unknown call id)");
    } else {
      line("result", `inconclusive: ${message}`);
    }
  }

  // ── 3. Contract shape ─────────────────────────────────────
  const resultSchema = getResultSchema(issueType);
  const properties = Object.keys(
    (resultSchema.properties ?? {}) as Record<string, unknown>,
  );

  console.log("\nResult schema");
  line("issue type", issueType);
  line("additionalProperties", resultSchema.additionalProperties);
  line("declared fields", properties.length);

  // CALL-E rejects undeclared fields, so the address fields the policy engine
  // needs must be present in the schema or the result comes back null.
  const requiredForDemo = ["address_line_1", "city", "address_confirmed"];
  const missing = requiredForDemo.filter((f) => !properties.includes(f));
  if (missing.length > 0) {
    console.error(
      `FAIL  schema for ${issueType} is missing ${missing.join(", ")}. ` +
        `CALL-E would return a null structured_result.`,
    );
    process.exit(1);
  }
  line("address fields", "PASS — declared");

  const taskText = buildTaskTemplate({
    agentName: "Riley",
    storeName: "Northstar Supply Co.",
    issueType,
    verificationCode: "000000",
    orderSnapshot: DEMO_SNAPSHOT,
    policyInstructions: "",
  });
  line("task text", `${taskText.length} chars`);

  // ── 4. Live call ──────────────────────────────────────────
  if (!phone) {
    console.log(
      "\nPreflight complete. No call was placed.\n" +
        "To place one real call:  npx tsx scripts/verify-calle.ts --call +15551234567\n",
    );
    return;
  }

  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    console.error(`\nFAIL  ${phone} is not a valid E.164 number.`);
    process.exit(1);
  }

  console.log(`\nPlacing ONE real call to ${phone}. This uses a call credit.`);

  const created = await provider.createCall({
    recipientPhone: phone,
    region: "US",
    locale: "en-US",
    idempotencyKey: `verify_${Date.now()}`,
    taskText,
    resultSchema,
    metadata: { product: "callmemaybe", purpose: "integration_verification" },
  });

  line("call id", created.providerCallId);
  line("status", created.status);

  // Poll until terminal.
  const deadline = Date.now() + 10 * 60 * 1000;
  let call = await provider.getCall(created.providerCallId);
  while (
    !["COMPLETED", "FAILED", "CANCELED"].includes(call.status) &&
    Date.now() < deadline
  ) {
    await new Promise((r) => setTimeout(r, 5000));
    call = await provider.getCall(created.providerCallId);
    process.stdout.write(`\r  waiting… status=${call.status}      `);
  }
  console.log("\n");

  console.log("Terminal result");
  line("status", call.status);
  line("outcome", call.outcome);
  line("task completed", call.taskCompleted);
  line(
    "confidence",
    `${call.completionConfidenceScore ?? "n/a"} (${call.completionConfidenceLabel ?? "n/a"})`,
  );
  line("summary", call.summary ?? "n/a");
  line("transcript turns", call.transcript ? call.transcript.split("\n").length : 0);
  line("evidence items", call.evidence?.length ?? 0);

  console.log("\nStructured result");
  console.log(JSON.stringify(call.structuredResult, null, 2));

  const events = await provider.getEvents(created.providerCallId);
  console.log(`\nEvents (${events.length})`);
  for (const event of events) {
    console.log(`  ${event.sequence}. ${event.eventType} @ ${event.eventTime}`);
  }

  if (call.structuredResult === undefined || call.structuredResult === null) {
    console.error(
      "\nFAIL  CALL-E returned no structured result. The result schema was " +
        "rejected or the call produced no usable evidence.",
    );
    process.exit(1);
  }

  console.log("\nPASS  Live CALL-E round trip verified.\n");
}

main().catch((error) => {
  console.error("\nFAIL ", error);
  process.exit(1);
});
