import type {
  OrderSnapshot,
  ActionReceipt,
  ResolutionActionType,
} from "../lib/types";
import { generateRequestId, sha256Hash } from "../lib/crypto.server";
import { createError, ErrorCodes } from "../lib/errors.server";

// This adapter wraps the Shopify Admin GraphQL client provided by the scaffold.
// It's instantiated per-request with the authenticated admin client.

export interface AdminClient {
  graphql(
    query: string,
    options?: { variables?: Record<string, unknown> },
  ): Promise<{ json(): Promise<unknown> }>;
}

export interface OrderContext {
  orderId: string;
  orderName: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  displayFulfillmentStatus: string;
  displayFinancialStatus: string;
  canceledAt: string | null;
  shippingAddress: ShippingAddress | null;
  lineItems: Array<{
    id: string;
    title: string;
    quantity: number;
    unfulfilledQuantity: number;
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
        canceledAt: cancelledAt
        customer {
          id
          firstName
          lastName
          defaultPhoneNumber { phoneNumber }
        }
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
              unfulfilledQuantity
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
  const customer = order.customer as Record<string, unknown> | null;
  const lineItems = (
    (order.lineItems as { edges?: Array<{ node: Record<string, unknown> }> })
      ?.edges ?? []
  ).map((e) => ({
    id: e.node.id as string,
    title: e.node.title as string,
    quantity: e.node.quantity as number,
    unfulfilledQuantity: (e.node.unfulfilledQuantity as number) ?? 0,
  }));

  return {
    orderId: order.id as string,
    orderName: order.name as string,
    customerId: (customer?.id as string) || null,
    customerName: customer
      ? [customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
        null
      : null,
    customerPhone:
      (customer?.defaultPhoneNumber as { phoneNumber?: string } | undefined)
        ?.phoneNumber || null,
    displayFulfillmentStatus:
      (order.displayFulfillmentStatus as string) || "UNFULFILLED",
    displayFinancialStatus:
      (order.displayFinancialStatus as string) || "PENDING",
    canceledAt: (order.canceledAt as string) || null,
    shippingAddress: address,
    lineItems,
    totalPriceSet: {
      shopMoney: {
        amount:
          (
            order.totalPriceSet as {
              shopMoney: { amount: string; currencyCode: string };
            }
          )?.shopMoney?.amount || "0",
        currencyCode:
          (
            order.totalPriceSet as {
              shopMoney: { amount: string; currencyCode: string };
            }
          )?.shopMoney?.currencyCode || "USD",
      },
    },
    createdAt: order.createdAt as string,
    updatedAt: order.updatedAt as string,
  };
}

export function buildOrderSnapshot(
  order: OrderContext,
  capturedAt = new Date(),
): OrderSnapshot {
  return {
    orderId: order.orderId,
    updatedAt: order.updatedAt,
    financialStatus: order.displayFinancialStatus,
    fulfillmentStatus: order.displayFulfillmentStatus,
    cancelledAt: order.canceledAt,
    shippingAddressHash: order.shippingAddress
      ? sha256Hash(JSON.stringify(order.shippingAddress))
      : null,
    fulfillmentHash: sha256Hash(
      JSON.stringify(order.lineItems.map((l) => l.unfulfilledQuantity)),
    ),
    lineItemHash: sha256Hash(JSON.stringify(order.lineItems.map((l) => l.id))),
    totalMinor: Math.round(
      parseFloat(order.totalPriceSet.shopMoney.amount) * 100,
    ),
    currencyCode: order.totalPriceSet.shopMoney.currencyCode,
    capturedAt: capturedAt.toISOString(),
  };
}

export function compareOrderSnapshots(
  before: OrderSnapshot,
  after: OrderSnapshot,
): { changed: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (before.fulfillmentStatus !== after.fulfillmentStatus) {
    reasons.push(
      `Fulfillment changed: ${before.fulfillmentStatus} → ${after.fulfillmentStatus}`,
    );
  }
  if (before.financialStatus !== after.financialStatus) {
    reasons.push(
      `Financial changed: ${before.financialStatus} → ${after.financialStatus}`,
    );
  }
  if (before.cancelledAt !== after.cancelledAt) {
    reasons.push("Order cancellation status changed");
  }
  if (before.shippingAddressHash !== after.shippingAddressHash) {
    reasons.push("Shipping address changed");
  }
  if (before.fulfillmentHash !== after.fulfillmentHash) {
    reasons.push("Line-item fulfillment changed");
  }
  if (before.lineItemHash !== after.lineItemHash) {
    reasons.push("Order line items changed");
  }
  if (
    before.totalMinor !== after.totalMinor ||
    before.currencyCode !== after.currencyCode
  ) {
    reasons.push("Order total changed");
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
  } catch {
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
  const after = updatedOrder
    ? {
        shippingAddress: (updatedOrder as Record<string, unknown>)
          .shippingAddress,
        updatedAt: (updatedOrder as Record<string, unknown>).updatedAt,
      }
    : undefined;

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
  } catch {
    throw createError(
      ErrorCodes.ORDER_NOT_FOUND,
      "Could not fetch order before cancellation",
      "Could not verify order state.",
    );
  }

  const mutation = `#graphql
    mutation CancelOrder(
      $orderId: ID!
      $notifyCustomer: Boolean
      $refundMethod: OrderCancelRefundMethodInput!
      $restock: Boolean!
      $reason: OrderCancelReason!
      $staffNote: String
    ) {
      orderCancel(
        orderId: $orderId
        notifyCustomer: $notifyCustomer
        refundMethod: $refundMethod
        restock: $restock
        reason: $reason
        staffNote: $staffNote
      ) {
        job { id done }
        orderCancelUserErrors {
          field
          message
          code
        }
      }
    }
  `;

  const response = await admin.graphql(mutation, {
    variables: {
      orderId,
      notifyCustomer: true,
      refundMethod: { originalPaymentMethodsRefund: true },
      restock: true,
      reason: "CUSTOMER",
      staffNote: reason.slice(0, 255),
    },
  });

  const json = (await response.json()) as {
    data?: {
      orderCancel?: {
        job?: { id: string; done: boolean };
        orderCancelUserErrors?: Array<{
          field?: string[];
          message: string;
          code?: string;
        }>;
      };
    };
  };

  const result = json.data?.orderCancel;
  const userErrors = result?.orderCancelUserErrors ?? [];
  const jobId = result?.job?.id;

  if (userErrors.length === 0 && jobId) {
    const jobQuery = `#graphql
      query CancellationJob($id: ID!) {
        job(id: $id) { id done }
      }
    `;

    let done = result?.job?.done ?? false;
    for (let attempt = 0; !done && attempt < 20; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const jobResponse = await admin.graphql(jobQuery, {
        variables: { id: jobId },
      });
      const jobJson = (await jobResponse.json()) as {
        data?: { job?: { id: string; done: boolean } };
      };
      done = jobJson.data?.job?.done ?? false;
    }

    if (!done) {
      userErrors.push({
        message:
          "Shopify accepted the cancellation, but it did not finish in time. Verify the order before retrying.",
      });
    } else {
      const confirmed = await fetchOrderContext(admin, orderId);
      if (!confirmed.canceledAt) {
        userErrors.push({
          message:
            "Shopify finished the cancellation job without marking the order cancelled.",
        });
      }
    }
  } else if (userErrors.length === 0) {
    userErrors.push({ message: "Shopify did not return a cancellation job." });
  }

  return {
    success: userErrors.length === 0,
    actionType: "CANCEL_ORDER" as ResolutionActionType,
    shopifyResourceId: orderId,
    idempotencyKey,
    attemptedAt,
    completedAt: userErrors.length === 0 ? new Date().toISOString() : undefined,
    before,
    after: jobId ? { jobId } : undefined,
    userErrors: userErrors.map((e) => ({
      field: e.field,
      message: e.message,
      code: e.code,
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
