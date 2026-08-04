import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildTaskTemplate,
  buildCarrierTraceTask,
  buildStuckOrderOutreachTask,
  getResultSchema,
  validateCallResult,
} from "../app/lib/call-plan";
import { IssueType, DEFAULT_POLICIES } from "../app/lib/types";
import type { OrderSnapshot } from "../app/lib/types";

const SNAPSHOT: OrderSnapshot = {
  orderId: "gid://shopify/Order/1043",
  updatedAt: "2026-08-01T00:00:00Z",
  financialStatus: "paid",
  fulfillmentStatus: "UNFULFILLED",
  cancelledAt: null,
  shippingAddressHash: null,
  fulfillmentHash: "h",
  lineItemHash: "h",
  totalMinor: 12400,
  currencyCode: "USD",
  capturedAt: "2026-08-01T00:00:00Z",
};

const ALL_ISSUE_TYPES = Object.values(IssueType);

function propsOf(issueType: string) {
  const schema = getResultSchema(issueType);
  return (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
}

describe("result schema contract", () => {
  test("every issue type produces a strict object schema", () => {
    for (const issueType of ALL_ISSUE_TYPES) {
      const schema = getResultSchema(issueType);
      assert.equal(schema.type, "object", issueType);
      assert.equal(
        schema.additionalProperties,
        false,
        `${issueType} must be strict — CALL-E rejects undeclared fields`,
      );
      assert.ok(Array.isArray(schema.required), issueType);
    }
  });

  test("every required field is actually declared in properties", () => {
    for (const issueType of ALL_ISSUE_TYPES) {
      const schema = getResultSchema(issueType);
      const props = propsOf(issueType);
      for (const field of schema.required as string[]) {
        assert.ok(
          field in props,
          `${issueType} requires "${field}" but never declares it`,
        );
      }
    }
  });

  test("issue-specific schemas keep the common fields the policy engine reads", () => {
    // evaluatePolicy reads disposition and identity_status off the structured
    // result. An issue-specific schema that dropped them would silently fail
    // every policy check.
    for (const issueType of ALL_ISSUE_TYPES) {
      const props = propsOf(issueType);
      for (const field of ["disposition", "identity_status", "requested_action", "summary"]) {
        assert.ok(field in props, `${issueType} is missing ${field}`);
      }
    }
  });

  test("enums only use CALL-E's supported schema features", () => {
    const unsupported = ["$ref", "oneOf", "anyOf", "allOf"];
    for (const issueType of ALL_ISSUE_TYPES) {
      const serialized = JSON.stringify(getResultSchema(issueType));
      for (const feature of unsupported) {
        assert.ok(
          !serialized.includes(`"${feature}"`),
          `${issueType} uses unsupported schema feature ${feature}`,
        );
      }
    }
  });

  test("every enum offers an unknown-style escape hatch", () => {
    // CALL-E's guidance: include an unknown value wherever the call may not
    // produce enough evidence, otherwise extraction fails the whole result.
    const exempt = new Set(["disposition", "identity_status", "requested_action"]);
    for (const issueType of ALL_ISSUE_TYPES) {
      for (const [name, prop] of Object.entries(propsOf(issueType))) {
        if (!Array.isArray(prop.enum) || exempt.has(name)) continue;
        const values = prop.enum as string[];
        assert.ok(
          values.some((v) => /unknown|no_decision|refused/.test(v)),
          `${issueType}.${name} has no unknown escape hatch: ${values.join(", ")}`,
        );
      }
    }
  });
});

describe("ADDRESS_CHANGE — the regression that made the demo impossible", () => {
  test("declares the fields its own validator demands", () => {
    const props = propsOf("ADDRESS_CHANGE");
    for (const field of ["address_line_1", "city", "address_confirmed"]) {
      assert.ok(field in props, `ADDRESS_CHANGE must declare ${field}`);
    }
  });

  test("a complete address result validates", () => {
    assert.equal(
      validateCallResult("ADDRESS_CHANGE", {
        disposition: "completed",
        identity_status: "verified",
        requested_action: "update_address",
        summary: "New address captured.",
        address_line_1: "118 Cedar Street",
        city: "Portland",
        address_confirmed: "yes",
      }),
      true,
    );
  });

  test("rejects an address the customer never confirmed", () => {
    assert.equal(
      validateCallResult("ADDRESS_CHANGE", {
        disposition: "completed",
        identity_status: "verified",
        requested_action: "update_address",
        summary: "Captured but unconfirmed.",
        address_line_1: "118 Cedar Street",
        city: "Portland",
        address_confirmed: "unknown",
      }),
      false,
    );
  });

  test("rejects a result missing the street line", () => {
    assert.equal(
      validateCallResult("ADDRESS_CHANGE", {
        disposition: "completed",
        identity_status: "verified",
        requested_action: "update_address",
        summary: "Incomplete.",
        city: "Portland",
        address_confirmed: "yes",
      }),
      false,
    );
  });
});

describe("CARRIER_TRACE schema", () => {
  test("declares the trace fields the case detail renders", () => {
    const props = propsOf("CARRIER_TRACE");
    for (const field of [
      "reached_agent",
      "trace_opened",
      "trace_reference",
      "carrier_disposition",
      "promised_response_by",
      "hold_time_minutes",
    ]) {
      assert.ok(field in props, `CARRIER_TRACE must declare ${field}`);
    }
  });

  test("trace_opened distinguishes refusal from failure", () => {
    const values = propsOf("CARRIER_TRACE").trace_opened.enum as string[];
    assert.ok(values.includes("refused"));
    assert.ok(values.includes("already_open"));
  });

  test("hold_time_minutes is an integer, not a string", () => {
    assert.equal(propsOf("CARRIER_TRACE").hold_time_minutes.type, "integer");
  });
});

describe("STUCK_ORDER_OUTREACH schema", () => {
  test("captures a single customer decision", () => {
    const values = propsOf("STUCK_ORDER_OUTREACH").customer_decision.enum as string[];
    for (const expected of ["provided_address", "cancel_order", "no_decision"]) {
      assert.ok(values.includes(expected), `missing ${expected}`);
    }
  });

  test("separates read-back from confirmation", () => {
    // These are two different things and collapsing them is how you end up
    // executing an address the customer never actually agreed to.
    const props = propsOf("STUCK_ORDER_OUTREACH");
    assert.ok("detail_read_back" in props);
    assert.ok("customer_confirmed_aloud" in props);
  });
});

describe("task templates", () => {
  test("carrier task carries the tracking number into the IVR instructions", () => {
    const text = buildCarrierTraceTask({
      agentName: "Riley",
      storeName: "Northstar Supply Co.",
      carrierName: "Northline Freight",
      trackingNumber: "NL4820199317",
      shipDate: "24 July 2026",
      deliveryClaimDate: "28 July 2026",
      shipToSummary: "front porch, Portland OR",
      policyInstructions: "",
    });

    assert.match(text, /NL4820199317/);
    assert.match(text, /Northline Freight/);
    assert.match(text, /automated menu/i);
    assert.match(text, /AI assistant/);
  });

  test("carrier task never asks for a verification code", () => {
    const text = buildCarrierTraceTask({
      agentName: "Riley",
      storeName: "Northstar Supply Co.",
      carrierName: "Northline Freight",
      trackingNumber: "NL4820199317",
      shipDate: "x",
      deliveryClaimDate: "y",
      shipToSummary: "z",
      policyInstructions: "",
    });

    // There is no customer on this call. Asking a carrier agent for a support
    // code would derail it.
    assert.doesNotMatch(text, /six-digit/i);
  });

  test("carrier task forbids accepting a resolution on the customer's behalf", () => {
    const text = buildCarrierTraceTask({
      agentName: "Riley",
      storeName: "S",
      carrierName: "C",
      trackingNumber: "T",
      shipDate: "x",
      deliveryClaimDate: "y",
      shipToSummary: "z",
      policyInstructions: "",
    });

    assert.match(text, /Do not accept a resolution on the customer's behalf/);
    assert.match(text, /Do not give payment details/);
  });

  test("outreach task leads with why the call is happening", () => {
    const text = buildStuckOrderOutreachTask({
      agentName: "Riley",
      storeName: "Northstar Supply Co.",
      verificationCode: "482910",
      orderSnapshot: SNAPSHOT,
      orderName: "#1051",
      blockerDescription: "Address is missing an apartment number.",
      emailAttempts: 2,
      policyInstructions: "",
    });

    const whyIndex = text.indexOf("WHY THIS CALL IS HAPPENING");
    const verifyIndex = text.indexOf("VERIFICATION");
    assert.ok(whyIndex > -1 && verifyIndex > whyIndex, "reason must come first");
    assert.match(text, /#1051/);
    assert.match(text, /emailed the customer 2 time\(s\)/);
    assert.match(text, /482910/);
  });

  test("both customer-facing templates gate disclosure on verification", () => {
    const outreach = buildStuckOrderOutreachTask({
      agentName: "Riley",
      storeName: "S",
      verificationCode: "111111",
      orderSnapshot: SNAPSHOT,
      orderName: "#1",
      blockerDescription: "b",
      emailAttempts: 1,
      policyInstructions: "",
    });
    const standard = buildTaskTemplate({
      agentName: "Riley",
      storeName: "S",
      issueType: "ADDRESS_CHANGE",
      verificationCode: "111111",
      orderSnapshot: SNAPSHOT,
      policyInstructions: "",
    });

    for (const text of [outreach, standard]) {
      assert.match(text, /Do not disclose order/i);
      assert.match(text, /no more than two attempts/i);
      assert.match(text, /Never reveal the code/i);
    }
  });
});

describe("policy matrix", () => {
  test("every issue type has a default policy", () => {
    for (const issueType of ALL_ISSUE_TYPES) {
      assert.ok(
        DEFAULT_POLICIES.some((p) => p.issueType === issueType),
        `${issueType} has no default policy, so getPolicyForIssue would fall through`,
      );
    }
  });

  test("carrier calls do not require customer identity verification", () => {
    const policy = DEFAULT_POLICIES.find((p) => p.issueType === "CARRIER_TRACE");
    assert.ok(policy);
    // There is no customer on the line, so requiring verification would make
    // every carrier call ineligible.
    assert.equal(policy!.requireVerifiedIdentity, false);
  });

  test("every customer-facing issue type requires identity verification", () => {
    for (const policy of DEFAULT_POLICIES) {
      if (policy.issueType === "CARRIER_TRACE") continue;
      assert.equal(
        policy.requireVerifiedIdentity,
        true,
        `${policy.issueType} must verify identity before disclosing order data`,
      );
    }
  });

  test("irreversible actions are never automatic by default", () => {
    for (const issueType of ["CANCELLATION", "RETURN", "CARRIER_TRACE"]) {
      const policy = DEFAULT_POLICIES.find((p) => p.issueType === issueType);
      assert.notEqual(policy?.mode, "AUTOMATIC", `${issueType} must not be automatic`);
    }
  });
});
