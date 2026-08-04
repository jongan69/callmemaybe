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
import type { IssueType } from "../lib/types";

// Merchant-initiated outreach.
//
// Everything else in the app starts with a customer clicking a button while
// looking at a screen. This page exists for the opposite case: the order cannot
// ship, the customer has stopped answering email, and the order is heading for
// a silent cancellation. Phone is the escalation channel, and the merchant is
// the one who decides to escalate.

type StuckOrder = {
  orderId: string;
  orderName: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  blockerDescription: string;
  emailAttempts: number;
  ageDays: number;
  valueMinor: number;
  currencyCode: string;
  // Set when the carrier claims delivery but the customer says otherwise.
  // These orders get a carrier leg before the customer is called.
  carrier?: {
    carrierName: string;
    supportPhone: string;
    trackingNumber: string;
    shipDate: string;
    deliveryClaimDate: string;
    shipToSummary: string;
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const settings = await prisma.shopSettings.findFirst({
    where: { shopDomain: session.shop },
  });

  // Orders already under an open case are excluded so the merchant cannot
  // queue a second call for something already in flight.
  const openCases = await prisma.supportCase.findMany({
    where: {
      shopId: settings?.id ?? "",
      status: {
        notIn: ["RESOLVED", "CANCELED", "CLOSED", "FAILED", "CALL_NOT_COMPLETED"],
      },
    },
    select: { shopifyOrderId: true },
  });
  const busyOrderIds = new Set(openCases.map((c) => c.shopifyOrderId));

  const stuckOrders = await loadStuckOrders(settings?.id ?? "");

  return {
    configured: Boolean(settings),
    storeName: settings?.storeName ?? "",
    orders: stuckOrders.filter((o) => !busyOrderIds.has(o.orderId)),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const settings = await prisma.shopSettings.findFirst({
    where: { shopDomain: session.shop },
  });
  if (!settings) {
    return { error: "This store has not finished CallmeMaybe setup." };
  }

  const formData = await request.formData();
  const orderId = String(formData.get("orderId"));
  const leg = String(formData.get("leg"));

  const orders = await loadStuckOrders(settings.id);
  const order = orders.find((o) => o.orderId === orderId);
  if (!order) {
    return { error: "That order is no longer eligible for outreach." };
  }

  const callsCarrier = leg === "carrier";
  if (callsCarrier && !order.carrier) {
    return { error: "That order has no carrier contact on file." };
  }

  const issueType: IssueType = callsCarrier
    ? "CARRIER_TRACE"
    : "STUCK_ORDER_OUTREACH";

  // Read live order state from Shopify. A hand-built snapshot would fail the
  // pre-execution drift check later, because it would never match what the
  // Admin API actually returns.
  let orderSnapshot;
  try {
    orderSnapshot = buildOrderSnapshot(await fetchOrderContext(admin, order.orderId));
  } catch {
    return {
      error: `Could not read ${order.orderName} from Shopify. It may have been deleted.`,
    };
  }

  try {
    const supportCase = await createSupportCase({
      shopId: settings.id,
      shopDomain: settings.shopDomain,
      shopifyOrderId: order.orderId,
      shopifyOrderName: order.orderName,
      shopifyCustomerId: order.customerId,
      issueType,
      customerPhone: order.customerPhone,
      customerName: order.customerName,
      orderSnapshot,
    });

    const callPlan = await buildCallPlan({
      supportCaseId: supportCase.caseId,
      shopId: settings.id,
      storeName: settings.storeName,
      agentName: settings.agentName,
      issueType,
      customerPhone: order.customerPhone,
      region: "US",
      locale: settings.defaultLocale,
      verificationCode: supportCase.verificationCode,
      orderSnapshot,
      orderName: order.orderName,
      ...(callsCarrier ? { carrier: order.carrier } : {}),
      ...(callsCarrier
        ? {}
        : {
            stuckOrder: {
              blockerDescription: order.blockerDescription,
              emailAttempts: order.emailAttempts,
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
      target: callsCarrier ? order.carrier!.carrierName : order.customerName,
      status: call.status,
    };
  } catch (error: unknown) {
    const appError = error as { userMessage?: string; message?: string };
    return {
      error:
        appError.userMessage ??
        appError.message ??
        "Could not start the call.",
    };
  }
};

// Stuck orders are seeded for the demo. In production this reads from Shopify
// via the Admin GraphQL API: unfulfilled orders past a shipping SLA, orders
// with a delivery exception, and orders where a notification bounced or went
// unanswered.
async function loadStuckOrders(shopId: string): Promise<StuckOrder[]> {
  const stored = await prisma.stuckOrder.findMany({
    where: { shopId, resolvedAt: null },
    orderBy: { detectedAt: "asc" },
  });

  return stored.map((o: (typeof stored)[number]) => ({
    orderId: o.shopifyOrderId,
    orderName: o.shopifyOrderName,
    customerId: o.shopifyCustomerId,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    blockerDescription: o.blockerDescription,
    emailAttempts: o.emailAttempts,
    ageDays: Math.floor(
      (Date.now() - o.detectedAt.getTime()) / (24 * 60 * 60 * 1000),
    ),
    valueMinor: o.valueMinor,
    currencyCode: o.currencyCode,
    ...(o.carrierName && o.carrierSupportPhone && o.trackingNumber
      ? {
          carrier: {
            carrierName: o.carrierName,
            supportPhone: o.carrierSupportPhone,
            trackingNumber: o.trackingNumber,
            shipDate: o.shipDate ?? "unknown",
            deliveryClaimDate: o.deliveryClaimDate ?? "unknown",
            shipToSummary: o.shipToSummary ?? "the address on the order",
          },
        }
      : {}),
  }));
}

function money(minor: number, currency: string) {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export default function Outreach() {
  const { orders, configured } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  return (
    <s-page heading="Outreach">
      <s-section heading="Orders that cannot ship">
        <s-text>
          These orders are blocked and the customer has stopped replying to
          email. Left alone they get cancelled and refunded. A call is the
          escalation channel.
        </s-text>

        {!configured && (
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-text>Finish setup in Settings before starting outreach.</s-text>
          </s-box>
        )}

        {actionData?.error && (
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-text>{actionData.error}</s-text>
          </s-box>
        )}

        {actionData?.ok && (
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-text>
              Calling {actionData.target}. Case {actionData.caseReference} is{" "}
              {actionData.status}.
            </s-text>
          </s-box>
        )}

        {orders.length === 0 ? (
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-text>No blocked orders. Nothing needs a call right now.</s-text>
          </s-box>
        ) : (
          orders.map((order) => (
            <s-box
              key={order.orderId}
              padding="base"
              borderWidth="base"
              borderRadius="base"
            >
              <s-stack direction="inline" gap="base">
                <s-stack direction="block" gap="base">
                  <s-heading>
                    {order.orderName} — {order.customerName}
                  </s-heading>
                  <s-text>{order.blockerDescription}</s-text>
                  <s-text>
                    {money(order.valueMinor, order.currencyCode)} · stuck{" "}
                    {order.ageDays} days · {order.emailAttempts} unanswered
                    email{order.emailAttempts === 1 ? "" : "s"}
                  </s-text>
                  {order.carrier && (
                    <s-badge tone="critical">
                      {order.carrier.carrierName} says delivered ·{" "}
                      {order.carrier.trackingNumber}
                    </s-badge>
                  )}
                </s-stack>

                <s-stack direction="block" gap="base">
                  {order.carrier && (
                    <Form method="post">
                      <input type="hidden" name="orderId" value={order.orderId} />
                      <input type="hidden" name="leg" value="carrier" />
                      <s-button type="submit" variant="primary" disabled={busy}>
                        Call {order.carrier.carrierName}
                      </s-button>
                    </Form>
                  )}
                  <Form method="post">
                    <input type="hidden" name="orderId" value={order.orderId} />
                    <input type="hidden" name="leg" value="customer" />
                    <s-button type="submit" disabled={busy}>
                      Call customer
                    </s-button>
                  </Form>
                </s-stack>
              </s-stack>
            </s-box>
          ))
        )}
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
