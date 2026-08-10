import { CallePhoneSupportProvider } from "../app/providers/calle-provider.server";
import { buildTaskTemplate, getResultSchema } from "../app/lib/call-plan";

const provider = new CallePhoneSupportProvider();
const recipientPhone = process.env.TEST_CUSTOMER_PHONE;
if (!recipientPhone?.startsWith("+")) {
  throw new Error(
    "Set TEST_CUSTOMER_PHONE to an authorized E.164 test number.",
  );
}

const snapshot = {
  orderId: "gid://shopify/Order/1043",
  updatedAt: new Date().toISOString(),
  financialStatus: "paid",
  fulfillmentStatus: "UNFULFILLED",
  cancelledAt: null,
  shippingAddressHash: null,
  fulfillmentHash: "h",
  lineItemHash: "h",
  totalMinor: 12400,
  currencyCode: "USD",
  capturedAt: new Date().toISOString(),
};

const taskText = buildTaskTemplate({
  agentName: "Riley",
  storeName: "Northstar Supply Co.",
  issueType: "ADDRESS_CHANGE",
  verificationCode: "000000",
  orderSnapshot: snapshot,
  policyInstructions: "",
});

console.log("Task text:", taskText.substring(0, 400));
console.log("");
console.log(
  "Placing customer call to authorized number ending",
  recipientPhone.slice(-4),
);

const created = await provider.createCall({
  recipientPhone,
  region: "US",
  locale: "en-US",
  idempotencyKey: "customer_test_" + Date.now(),
  taskText,
  resultSchema: getResultSchema("ADDRESS_CHANGE"),
  metadata: { product: "callmemaybe", purpose: "customer_verification" },
});

console.log("Call ID:", created.providerCallId);
console.log("Status:", created.status);

const deadline = Date.now() + 10 * 60 * 1000;
let call = await provider.getCall(created.providerCallId);
while (
  !["COMPLETED", "FAILED", "CANCELED"].includes(call.status) &&
  Date.now() < deadline
) {
  await new Promise((r) => setTimeout(r, 5000));
  call = await provider.getCall(created.providerCallId);
  process.stdout.write(".");
}

console.log("");
console.log("Final status:", call.status);
console.log("Outcome:", call.outcome);
console.log(
  "Structured result:",
  JSON.stringify(call.structuredResult, null, 2),
);
