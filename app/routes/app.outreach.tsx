import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  useLoaderData,
  useActionData,
  useNavigation,
  useRouteError,
  Form,
} from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import {
  createSupportCase,
  buildCallPlan,
  submitCall,
} from "../services/support-case.server";
import {
  fetchOrderContext,
  buildOrderSnapshot,
} from "../services/shopify-adapter.server";
import type { AdminClient } from "../services/shopify-adapter.server";
import type { IssueType } from "../lib/types";

// ── Types ──────────────────────────────────────────────────────

type OutreachOrder = {
  orderId: string;
  orderName: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  fulfillmentStatus: string;
  financialStatus: string;
  createdAt: string;
  totalMinor: number;
  currencyCode: string;
  shippingAddress?: {
    address1?: string;
    city?: string;
    province?: string;
    zip?: string;
    country?: string;
  };
};

// ── Shopify Admin query ────────────────────────────────────────

const UNFULFILLED_ORDERS_QUERY = `#graphql
  query UnfulfilledOrders($first: Int!) {
    orders(first: $first, reverse: true, query: "fulfillment_status:unfulfilled") {
      edges {
        node {
          id
          name
          displayFulfillmentStatus
          displayFinancialStatus
          createdAt
          shippingAddress {
            address1
            city
            province
            zip
            countryCodeV2
            name
            phone
          }
          totalPriceSet {
            shopMoney { amount currencyCode }
          }
          customer {
            id
            firstName
            lastName
            email
            phone
          }
        }
      }
    }
  }
`;

async function loadUnfulfilledOrders(admin: AdminClient): Promise<OutreachOrder[]> {
  const resp = await admin.graphql(UNFULFILLED_ORDERS_QUERY, {
    variables: { first: 50 },
  });
  const json = (await resp.json()) as {
    data?: { orders?: { edges?: Array<{ node: Record<string, unknown> }> } };
  };

  const edges = json.data?.orders?.edges ?? [];
  return edges.map(({ node: o }) => {
    const customer = o.customer as Record<string, unknown> | undefined;
    const addr = o.shippingAddress as Record<string, unknown> | undefined;
    const total = o.totalPriceSet as { shopMoney?: { amount?: string; currencyCode?: string } };
    const amount = total?.shopMoney?.amount ?? "0";
    return {
      orderId: o.id as string,
      orderName: o.name as string,
      fulfillmentStatus: (o.displayFulfillmentStatus as string) || "UNFULFILLED",
      financialStatus: (o.displayFinancialStatus as string) || "PENDING",
      customerId: (customer?.id as string) ?? "unknown",
      customerName: [customer?.firstName, customer?.lastName].filter(Boolean).join(" ") || "Customer",
      customerPhone: (addr?.phone as string) || (customer?.phone as string) || "",
      createdAt: o.createdAt as string,
      totalMinor: Math.round(parseFloat(amount) * 100),
      currencyCode: total?.shopMoney?.currencyCode ?? "USD",
      shippingAddress: addr ? {
        address1: addr.address1 as string,
        city: addr.city as string,
        province: addr.province as string,
        zip: addr.zip as string,
        country: addr.countryCodeV2 as string,
      } : undefined,
    };
  });
}

// ── Loader ─────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const settings = await prisma.shopSettings.findFirst({
    where: { shopDomain: session.shop },
  });

  // Auto-create settings on first visit so the merchant never sees a blank state.
  if (!settings) {
    return { configured: false, storeName: session.shop, orders: [] as OutreachOrder[] };
  }

  // Exclude orders already under an open case.
  const openCases = await prisma.supportCase.findMany({
    where: {
      shopId: settings.id,
      status: { notIn: ["RESOLVED", "CANCELED", "CLOSED", "FAILED", "CALL_NOT_COMPLETED"] },
    },
    select: { shopifyOrderId: true },
  });
  const busyIds = new Set(openCases.map((c) => c.shopifyOrderId));

  try {
    const orders = (await loadUnfulfilledOrders(admin)).filter(
      (o) => !busyIds.has(o.orderId),
    );
    return { configured: true, storeName: settings.storeName, orders };
  } catch {
    return { configured: true, storeName: settings.storeName, orders: [] as OutreachOrder[] };
  }
};

// ── Action ─────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const settings = await prisma.shopSettings.findFirst({
    where: { shopDomain: session.shop },
  });
  if (!settings) {
    return { error: "Finish setup in Settings before placing calls." };
  }

  const formData = await request.formData();
  const orderId = String(formData.get("orderId"));
  const leg = String(formData.get("leg")); // "customer" | "carrier"

  // Carrier fields (only used when leg === "carrier")
  const carrierName = String(formData.get("carrierName") ?? "");
  const carrierPhone = String(formData.get("carrierPhone") ?? "");
  const trackingNumber = String(formData.get("trackingNumber") ?? "");

  if (leg === "carrier" && (!carrierName || !carrierPhone)) {
    return { error: "Enter the carrier name and phone number." };
  }

  const callsCarrier = leg === "carrier";
  const issueType: IssueType = callsCarrier ? "CARRIER_TRACE" : "STUCK_ORDER_OUTREACH";

  // Read live order from Shopify.
  let orderContext;
  try {
    orderContext = await fetchOrderContext(admin, orderId);
  } catch {
    return { error: "Could not read that order from Shopify. It may have been deleted." };
  }

  const orderSnapshot = buildOrderSnapshot(orderContext);
  const customerPhone =
    orderContext.shippingAddress?.phone ?? "";
  const customerName =
    orderContext.shippingAddress?.name ?? "Customer";

  try {
    const supportCase = await createSupportCase({
      shopId: settings.id,
      shopDomain: settings.shopDomain,
      shopifyOrderId: orderId,
      shopifyOrderName: orderContext.orderName,
      shopifyCustomerId: String((orderContext as unknown as Record<string, unknown>).customerId ?? "unknown"),
      issueType,
      customerPhone: customerPhone || carrierPhone, // fallback for carrier leg
      customerName,
      orderSnapshot,
    });

    const callPlan = await buildCallPlan({
      supportCaseId: supportCase.caseId,
      shopId: settings.id,
      storeName: settings.storeName,
      agentName: settings.agentName,
      issueType,
      customerPhone: customerPhone || carrierPhone,
      region: "US",
      locale: settings.defaultLocale,
      verificationCode: supportCase.verificationCode,
      orderSnapshot,
      orderName: orderContext.orderName,
      ...(callsCarrier
        ? {
            carrier: {
              carrierName,
              supportPhone: carrierPhone,
              trackingNumber,
              shipDate: orderContext.createdAt,
              deliveryClaimDate: "",
              shipToSummary: orderContext.shippingAddress
                ? [orderContext.shippingAddress.address1, orderContext.shippingAddress.city]
                    .filter(Boolean)
                    .join(", ")
                : "the address on the order",
            },
          }
        : {
            stuckOrder: {
              blockerDescription: "Order is unfulfilled and needs a customer decision.",
              emailAttempts: 0,
            },
          }),
    });

    const call = await submitCall({
      supportCaseId: supportCase.caseId,
      callPlanId: callPlan.callPlanId,
      shopId: settings.id,
    });

    return {
      ok: true,
      caseReference: supportCase.publicReference,
      target: callsCarrier ? carrierName : customerName || "customer",
      status: call.status,
    };
  } catch (error: unknown) {
    const appError = error as { userMessage?: string; message?: string };
    return {
      error: appError.userMessage ?? appError.message ?? "Could not start the call.",
    };
  }
};

// ── Money formatter ────────────────────────────────────────────

function fmt(minor: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100);
}

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

// ── UI ─────────────────────────────────────────────────────────

export default function Outreach() {
  const { orders, configured } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const busy = nav.state === "submitting";

  return (
    <s-page heading="Outreach">
      <s-section heading="Unfulfilled Orders">
        <s-text>
          Orders that haven&apos;t shipped yet. When email stops working, a phone
          call is the escalation channel — call the carrier about a delivery issue,
          or call the customer to resolve a blocker.
        </s-text>

        {!configured && (
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-text>Complete setup in Settings first — your store needs a name and an agent.</s-text>
          </s-box>
        )}

        {actionData?.error && (
          <s-banner tone="critical"><s-text>{actionData.error}</s-text></s-banner>
        )}

        {actionData?.ok && (
          <s-banner tone="success">
            <s-text>
              Calling {actionData.target}. Case {actionData.caseReference} —{" "}
              {actionData.status}.
            </s-text>
          </s-banner>
        )}

        {orders.length === 0 && configured && (
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-text>No unfulfilled orders right now.</s-text>
          </s-box>
        )}

        {orders.map((order) => (
          <s-box key={order.orderId} padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="base">
              <s-heading>
                {order.orderName} — {order.customerName}
              </s-heading>
              <s-text>
                {fmt(order.totalMinor, order.currencyCode)} ·{" "}
                {order.fulfillmentStatus.toLowerCase()} ·{" "}
                {daysAgo(order.createdAt)} days old
                {order.shippingAddress && (
                  <> · {[order.shippingAddress.city, order.shippingAddress.province]
                    .filter(Boolean)
                    .join(", ")}</>
                )}
              </s-text>
              {!order.customerPhone && (
                <s-badge tone="warning">No phone on file</s-badge>
              )}

              <s-stack direction="inline" gap="base">
                {/* Customer call */}
                <Form method="post" style={{ display: "inline" }}>
                  <input type="hidden" name="orderId" value={order.orderId} />
                  <input type="hidden" name="leg" value="customer" />
                  <s-button type="submit" disabled={busy || !order.customerPhone}>
                    Call customer
                  </s-button>
                </Form>

                {/* Carrier call — inline form for carrier details */}
                <Form method="post" style={{ display: "inline" }}>
                  <input type="hidden" name="orderId" value={order.orderId} />
                  <input type="hidden" name="leg" value="carrier" />
                  <s-button type="submit" variant="primary" disabled={busy}>
                    Call carrier
                  </s-button>
                  <span> Carrier: </span>
                  <input
                    name="carrierName"
                    placeholder="UPS / FedEx / DHL"
                    defaultValue=""
                    style={{ width: 120 }}
                    disabled={busy}
                  />
                  <input
                    name="carrierPhone"
                    type="tel"
                    placeholder="+1..."
                    defaultValue=""
                    style={{ width: 140 }}
                    disabled={busy}
                  />
                  <input
                    name="trackingNumber"
                    placeholder="Tracking # (optional)"
                    defaultValue=""
                    style={{ width: 160 }}
                    disabled={busy}
                  />
                </Form>
              </s-stack>
            </s-stack>
          </s-box>
        ))}
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
