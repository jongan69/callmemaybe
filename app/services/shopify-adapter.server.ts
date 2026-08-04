import type { OrderSnapshot, ActionReceipt, ResolutionActionType } from "../lib/types";
import { generateRequestId, sha256Hash } from "../lib/crypto.server";
import { createError, ErrorCodes } from "../lib/errors.server";

// This adapter wraps the Shopify Admin GraphQL client provided by the scaffold.
// It's instantiated per-request with the authenticated admin client.

export interface AdminClient {
  graphql(query: string, options?: { variables?: Record<string, unknown> }): Promise<{ json(): Promise<unknown> }>;
}

export interface OrderContext {
  orderId: string;
  orderName: string;
  displayFulfillmentStatus: string;
  displayFinancialStatus: string;
  canceledAt: string | null;
  shippingAddress: ShippingAddress | null;
  lineItems: Array<{
    id: string;
    title: string;
    quantity: number;
    fulfillmentStatus: string;
  }>;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  createdAt: string;
  updatedAt: string;
}

interface ShippingAddress {
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  zip?: string;
  countryCodeV2?: string;
  name?: string;
  phone?: string;
}

export async function fetchOrderContext(
  admin: AdminClient,
  orderId: string,
): Promise<OrderContext> {
  const query = `#graphql
    query GetOrderContext($id: ID!) {
      order(id: $id) {
        id
        name
        displayFulfillmentStatus
        displayFinancialStatus
        canceledAt
        shippingAddress {
          address1
          address2
          city
          province
          zip
          countryCodeV2
          name
          phone
        }
        lineItems(first: 20) {
          edges {
            node {
              id
              title
              quantity
              fulfillmentStatus
            }
          }
        }
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        createdAt
        updatedAt
      }
    }
  `;

  const response = await admin.graphql(query, {
    variables: { id: orderId },
  });
  const json = (await response.json()) as {
    data?: { order?: Record<string, unknown> };
  };

  if (!json.data?.order) {
    throw createError(
      ErrorCodes.ORDER_NOT_FOUND,
      `Order ${orderId} not found`,
      "Order not found.",
    );
  }

  const order = json.data.order as Record<string, unknown>;
  const address = order.shippingAddress as ShippingAddress | null;
  const lineItems = ((order.lineItems as { edges?: Array<{ node: Record<string, unknown> }> })?.edges ?? []).map((e) => ({
    id: e.node.id as string,
    title: e.node.title as string,
    quantity: e.node.quantity as number,
    fulfillmentStatus: (e.node.fulfillmentStatus as string) || "UNFULFILLED",
  }));

  return {
    orderId: order.id as string,
    orderName: order.name as string,
    displayFulfillmentStatus: (order.displayFulfillmentStatus as string) || "UNFULFILLED",
    displayFinancialStatus: (order.displayFinancialStatus as string) || "PENDING",
    canceledAt: (order.canceledAt as string) || null,
    shippingAddress: address,
    lineItems,
    totalPriceSet: {
      shopMoney: {
        amount: (order.totalPriceSet as { shopMoney: { amount: string; currencyCode: string } })?.shopMoney?.amount || "0",
        currencyCode: (order.totalPriceSet as { shopMoney: { amount: string; currencyCode: string } })?.shopMoney?.currencyCode || "USD",
      },
    },
    createdAt: order.createdAt as string,
    updatedAt: order.updatedAt as string,
  };
}

export function buildOrderSnapshot(order: OrderContext): OrderSnapshot {
  return {
    orderId: order.orderId,
    updatedAt: order.updatedAt,
    financialStatus: order.displayFinancialStatus,
    fulfillmentStatus: order.displayFulfillmentStatus,
    cancelledAt: order.canceledAt,
    shippingAddressHash: order.shippingAddress
      ? sha256Hash(JSON.stringify(order.shippingAddress))
      : null,
    fulfillmentHash: sha256Hash(JSON.stringify(order.lineItems.map((l) => l.fulfillmentStatus))),
    lineItemHash: sha256Hash(JSON.stringify(order.lineItems.map((l) => l.id))),
    totalMinor: Math.round(parseFloat(order.totalPriceSet.shopMoney.amount) * 100),
    currencyCode: order.totalPriceSet.shopMoney.currencyCode,
    capturedAt: order.createdAt,
  };
}

export function compareOrderSnapshots(
  before: OrderSnapshot,
  after: OrderSnapshot,
): { changed: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (before.fulfillmentStatus !== after.fulfillmentStatus) {
    reasons.push(`Fulfillment changed: ${before.fulfillmentStatus} → ${after.fulfillmentStatus}`);
  }
  if (before.financialStatus !== after.financialStatus) {
    reasons.push(`Financial changed: ${before.financialStatus} → ${after.financialStatus}`);
  }
  if (before.cancelledAt !== after.cancelledAt) {
    reasons.push("Order cancellation status changed");
  }
  if (before.updatedAt !== after.updatedAt) {
    reasons.push("Order was updated during the call");
  }

  return { changed: reasons.length > 0, reasons };
}

// ─── Address Update ─────────────────────────────────────────

export async function updateShippingAddress(
  admin: AdminClient,
  orderId: string,
  address: {
    address1: string;
    address2?: string;
    city: string;
    province: string;
    zip: string;
    countryCode: string;
    name?: string;
    phone?: string;
  },
): Promise<ActionReceipt> {
  const idempotencyKey = generateRequestId();
  const attemptedAt = new Date().toISOString();

  // Fetch current order state before mutation
  let before: OrderSnapshot;
  try {
    const order = await fetchOrderContext(admin, orderId);
    before = buildOrderSnapshot(order);
  } catch (e) {
    throw createError(
      ErrorCodes.ORDER_NOT_FOUND,
      "Could not fetch order before address update",
      "Could not verify order state.",
    );
  }

  const mutation = `#graphql
    mutation UpdateOrderShippingAddress($input: OrderInput!) {
      orderUpdate(input: $input) {
        order {
          id
          updatedAt
          shippingAddress {
            address1
            address2
            city
            province
            zip
            countryCodeV2
            name
            phone
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      id: orderId,
      shippingAddress: {
        address1: address.address1,
        address2: address.address2 || "",
        city: address.city,
        province: address.province,
        zip: address.zip,
        countryCode: address.countryCode,
        ...(address.name ? { name: address.name } : {}),
        ...(address.phone ? { phone: address.phone } : {}),
      },
    },
  };

  const response = await admin.graphql(mutation, { variables });
  const json = (await response.json()) as {
    data?: {
      orderUpdate?: {
        order?: Record<string, unknown>;
        userErrors?: Array<{ field?: string[]; message: string }>;
      };
    };
  };

  const result = json.data?.orderUpdate;
  const userErrors = result?.userErrors ?? [];

  if (userErrors.length > 0) {
    return {
      success: false,
      actionType: "UPDATE_ADDRESS" as ResolutionActionType,
      shopifyResourceId: orderId,
      idempotencyKey,
      attemptedAt,
      before,
      userErrors: userErrors.map((e) => ({
        field: e.field,
        message: e.message,
      })),
      requestId: generateRequestId(),
    };
  }

  const updatedOrder = result?.order;
  const after = updatedOrder ? {
    shippingAddress: (updatedOrder as Record<string, unknown>).shippingAddress,
    updatedAt: (updatedOrder as Record<string, unknown>).updatedAt,
  } : undefined;

  return {
    success: true,
    actionType: "UPDATE_ADDRESS" as ResolutionActionType,
    shopifyResourceId: orderId,
    idempotencyKey,
    attemptedAt,
    completedAt: new Date().toISOString(),
    before,
    after,
    userErrors: [],
    requestId: generateRequestId(),
  };
}

// ─── Order Cancel ───────────────────────────────────────────

export async function cancelOrder(
  admin: AdminClient,
  orderId: string,
  reason: string,
): Promise<ActionReceipt> {
  const idempotencyKey = generateRequestId();
  const attemptedAt = new Date().toISOString();

  let before: OrderSnapshot;
  try {
    const order = await fetchOrderContext(admin, orderId);
    before = buildOrderSnapshot(order);
  } catch (e) {
    throw createError(
      ErrorCodes.ORDER_NOT_FOUND,
      "Could not fetch order before cancellation",
      "Could not verify order state.",
    );
  }

  const mutation = `#graphql
    mutation CancelOrder($input: OrderCancelInput!) {
      orderCancel(input: $input) {
        orderCancel {
          id
          canceledAt
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const response = await admin.graphql(mutation, {
    variables: {
      input: {
        id: orderId,
        reason: "CUSTOMER",
        note: reason,
      },
    },
  });

  const json = (await response.json()) as {
    data?: {
      orderCancel?: {
        orderCancel?: { id: string; canceledAt: string };
        userErrors?: Array<{ field?: string[]; message: string }>;
      };
    };
  };

  const result = json.data?.orderCancel;
  const userErrors = result?.userErrors ?? [];

  return {
    success: userErrors.length === 0,
    actionType: "CANCEL_ORDER" as ResolutionActionType,
    shopifyResourceId: orderId,
    idempotencyKey,
    attemptedAt,
    completedAt: userErrors.length === 0 ? new Date().toISOString() : undefined,
    before,
    userErrors: userErrors.map((e) => ({
      field: e.field,
      message: e.message,
    })),
    requestId: generateRequestId(),
  };
}

// ─── Add Order Note ─────────────────────────────────────────

export async function addOrderNote(
  admin: AdminClient,
  orderId: string,
  note: string,
): Promise<ActionReceipt> {
  const mutation = `#graphql
    mutation OrderUpdateNote($input: OrderInput!) {
      orderUpdate(input: $input) {
        order { id note }
        userErrors { field message }
      }
    }
  `;

  const response = await admin.graphql(mutation, {
    variables: { input: { id: orderId, note } },
  });

  const json = (await response.json()) as {
    data?: {
      orderUpdate?: {
        order?: { id: string };
        userErrors?: Array<{ field?: string[]; message: string }>;
      };
    };
  };

  const result = json.data?.orderUpdate;
  const userErrors = result?.userErrors ?? [];

  return {
    success: userErrors.length === 0,
    actionType: "ADD_NOTE" as ResolutionActionType,
    shopifyResourceId: orderId,
    idempotencyKey: generateRequestId(),
    attemptedAt: new Date().toISOString(),
    completedAt: userErrors.length === 0 ? new Date().toISOString() : undefined,
    before: {},
    userErrors: userErrors.map((e) => ({
      field: e.field,
      message: e.message,
    })),
    requestId: generateRequestId(),
  };
}
