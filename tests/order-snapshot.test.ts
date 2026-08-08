import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildOrderSnapshot,
  compareOrderSnapshots,
  type OrderContext,
} from "../app/services/shopify-adapter.server";

// The drift check is the safety property that keeps this app from doing damage.
// A proposal is built from a snapshot taken when the call started; a merchant
// approves it minutes or hours later. If the order moved in between — shipped,
// cancelled, edited by a human — executing the proposal is how you ship to an
// address the customer already corrected, or cancel an order that already went
// out. These tests pin that behaviour down.

function orderFixture(overrides: Partial<OrderContext> = {}): OrderContext {
  return {
    orderId: "gid://shopify/Order/1043",
    orderName: "#1043",
    customerId: "gid://shopify/Customer/5501",
    customerName: "Alex Johnson",
    customerEmail: "alex@example.com",
    customerPhone: "+15035550199",
    displayFulfillmentStatus: "UNFULFILLED",
    displayFinancialStatus: "PAID",
    canceledAt: null,
    shippingAddress: {
      address1: "118 Cedar Street",
      city: "Portland",
      province: "OR",
      zip: "97214",
      countryCodeV2: "US",
    },
    lineItems: [
      { id: "li_1", title: "Trail Jacket", quantity: 1, unfulfilledQuantity: 1 },
    ],
    totalPriceSet: { shopMoney: { amount: "124.00", currencyCode: "USD" } },
    createdAt: "2026-07-24T10:00:00Z",
    updatedAt: "2026-07-24T10:00:00Z",
    ...overrides,
  };
}

describe("buildOrderSnapshot", () => {
  test("converts money to minor units without floating point drift", () => {
    const snapshot = buildOrderSnapshot(
      orderFixture({
        totalPriceSet: { shopMoney: { amount: "124.99", currencyCode: "USD" } },
      }),
    );
    assert.equal(snapshot.totalMinor, 12499);
  });

  test("handles amounts that float arithmetic would round badly", () => {
    // 8.20 * 100 is 819.9999... in IEEE 754. A truncating conversion would
    // record 819 minor units and quietly understate the order value.
    const snapshot = buildOrderSnapshot(
      orderFixture({
        totalPriceSet: { shopMoney: { amount: "8.20", currencyCode: "USD" } },
      }),
    );
    assert.equal(snapshot.totalMinor, 820);
  });

  test("is stable across identical orders", () => {
    const a = buildOrderSnapshot(orderFixture());
    const b = buildOrderSnapshot(orderFixture());
    assert.deepEqual(a, b);
  });

  test("hashes the address rather than storing it", () => {
    const snapshot = buildOrderSnapshot(orderFixture());
    assert.ok(snapshot.shippingAddressHash);
    assert.doesNotMatch(JSON.stringify(snapshot), /Cedar Street/);
  });

  test("null address produces a null hash, not a hash of null", () => {
    const snapshot = buildOrderSnapshot(orderFixture({ shippingAddress: null }));
    assert.equal(snapshot.shippingAddressHash, null);
  });
});

describe("compareOrderSnapshots — what must block execution", () => {
  const before = buildOrderSnapshot(orderFixture());

  test("an unchanged order does not block", () => {
    const after = buildOrderSnapshot(orderFixture());
    const result = compareOrderSnapshots(before, after);
    assert.equal(result.changed, false);
    assert.deepEqual(result.reasons, []);
  });

  test("blocks when the order shipped during the call", () => {
    const after = buildOrderSnapshot(
      orderFixture({
        displayFulfillmentStatus: "FULFILLED",
        updatedAt: "2026-07-24T11:00:00Z",
      }),
    );
    const result = compareOrderSnapshots(before, after);
    assert.equal(result.changed, true);
    assert.ok(result.reasons.some((r) => /Fulfillment changed/.test(r)));
  });

  test("blocks when the order was cancelled during the call", () => {
    const after = buildOrderSnapshot(
      orderFixture({
        canceledAt: "2026-07-24T10:30:00Z",
        updatedAt: "2026-07-24T10:30:00Z",
      }),
    );
    const result = compareOrderSnapshots(before, after);
    assert.equal(result.changed, true);
    assert.ok(result.reasons.some((r) => /cancellation/i.test(r)));
  });

  test("blocks when payment state changed", () => {
    const after = buildOrderSnapshot(
      orderFixture({
        displayFinancialStatus: "REFUNDED",
        updatedAt: "2026-07-24T10:45:00Z",
      }),
    );
    const result = compareOrderSnapshots(before, after);
    assert.equal(result.changed, true);
    assert.ok(result.reasons.some((r) => /Financial changed/.test(r)));
  });

  test("blocks on a bare updatedAt change even when nothing else moved", () => {
    // Someone edited the order in Shopify admin. We cannot tell what they
    // changed, so the conservative answer is to stop and ask a human.
    const after = buildOrderSnapshot(
      orderFixture({ updatedAt: "2026-07-24T10:15:00Z" }),
    );
    const result = compareOrderSnapshots(before, after);
    assert.equal(result.changed, true);
    assert.ok(result.reasons.some((r) => /updated during the call/.test(r)));
  });

  test("blocks when the shipping address changes", () => {
    const before = buildOrderSnapshot(orderFixture());
    const after = buildOrderSnapshot(orderFixture({
      shippingAddress: {
        address1: "900 Pine Street",
        city: "Portland",
        province: "OR",
        zip: "97205",
        countryCodeV2: "US",
      },
    }));

    const result = compareOrderSnapshots(before, after);
    assert.equal(result.changed, true);
    assert.ok(result.reasons.some((reason) => reason.includes("Shipping address")));
  });

  test("blocks when the order total changes", () => {
    const before = buildOrderSnapshot(orderFixture());
    const after = buildOrderSnapshot(orderFixture({
      totalPriceSet: { shopMoney: { amount: "129.00", currencyCode: "USD" } },
    }));

    const result = compareOrderSnapshots(before, after);
    assert.equal(result.changed, true);
    assert.ok(result.reasons.some((reason) => reason.includes("total")));
  });

  test("reports every reason, not just the first", () => {
    const after = buildOrderSnapshot(
      orderFixture({
        displayFulfillmentStatus: "FULFILLED",
        displayFinancialStatus: "REFUNDED",
        canceledAt: "2026-07-24T11:00:00Z",
        updatedAt: "2026-07-24T11:00:00Z",
      }),
    );
    const result = compareOrderSnapshots(before, after);
    assert.equal(result.reasons.length, 4);
  });

  test("comparison is symmetric about whether something changed", () => {
    const after = buildOrderSnapshot(
      orderFixture({ displayFulfillmentStatus: "FULFILLED" }),
    );
    assert.equal(compareOrderSnapshots(before, after).changed, true);
    assert.equal(compareOrderSnapshots(after, before).changed, true);
  });
});
