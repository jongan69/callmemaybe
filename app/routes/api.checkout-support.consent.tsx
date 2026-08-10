import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import prisma from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";
import { fetchOrderContext } from "../services/shopify-adapter.server";
import {
  grantCallConsent,
  normalizePhone,
  revokeCallConsent,
} from "../services/consent.server";
import { consentText } from "../lib/regions";

const OrderIdSchema = z.string().regex(/^gid:\/\/shopify\/Order\/[^/?#]+$/);
const LocaleSchema = z.string().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/);
const CheckoutConsentPayloadSchema = z
  .object({
    orderId: OrderIdSchema,
    intent: z.enum(["grant", "revoke"]),
    locale: LocaleSchema.optional(),
  })
  .strict();

async function checkoutContext(request: Request, orderId: string) {
  const { sessionToken, cors } = await authenticate.public.checkout(request);
  const shopDomain = String(sessionToken.dest ?? "").replace(
    /^https?:\/\//,
    "",
  );
  const settings = await prisma.shopSettings.findUnique({
    where: { shopDomain },
  });
  if (!settings) throw new Response("Store not configured", { status: 404 });
  const { admin } = await unauthenticated.admin(shopDomain);
  const order = await fetchOrderContext(admin, orderId);
  const tokenCustomerId = String(sessionToken.sub ?? "");
  const customerId = order.customerId;
  if (!customerId || !tokenCustomerId || tokenCustomerId !== customerId) {
    throw new Response(
      "Sign in to the customer account before changing call consent.",
      { status: 401 },
    );
  }
  const phone = normalizePhone(
    order.shippingAddress?.phone ?? order.customerPhone ?? "",
  );
  if (!phone)
    throw new Response("A supported phone number is required", { status: 400 });
  return { cors, settings, order, customerId, tokenCustomerId, phone };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const parsedOrderId = OrderIdSchema.safeParse(
    url.searchParams.get("orderId"),
  );
  if (!parsedOrderId.success)
    return Response.json({ error: "Invalid request" }, { status: 400 });
  const orderId = parsedOrderId.data;
  const { cors, settings } = await checkoutContext(request, orderId);
  return cors(
    Response.json({
      text: consentText(
        url.searchParams.get("locale") || settings.defaultLocale,
        settings.storeName,
      ),
    }),
  );
}

export async function action({ request }: ActionFunctionArgs) {
  const { cors } = await authenticate.public.checkout(request);
  if (request.method !== "POST")
    return cors(
      Response.json({ error: "Method not allowed" }, { status: 405 }),
    );
  const parsedBody = CheckoutConsentPayloadSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsedBody.success) {
    return cors(Response.json({ error: "Invalid request" }, { status: 400 }));
  }
  const body = parsedBody.data;
  let context;
  try {
    context = await checkoutContext(request, body.orderId);
  } catch (error) {
    if (error instanceof Response) return cors(error);
    throw error;
  }
  const { settings, customerId, tokenCustomerId, phone } = context;

  if (body.intent === "revoke") {
    await revokeCallConsent({
      shopId: settings.id,
      shopifyOrderId: body.orderId,
      shopifyCustomerId: customerId,
      reason: "thank_you_revocation",
    });
    return cors(Response.json({ consent: { active: false } }));
  }
  const consent = await grantCallConsent({
    shopId: settings.id,
    shopifyOrderId: body.orderId,
    shopifyCustomerId: customerId,
    phone: phone.e164,
    purpose: "ORDER_SUPPORT",
    source: "thank_you",
    locale: body.locale || settings.defaultLocale,
    storeName: settings.storeName,
    sessionTokenSubject: tokenCustomerId,
    userAgentSummary:
      request.headers.get("User-Agent")?.slice(0, 240) ?? undefined,
  });
  return cors(
    Response.json({
      consent: { active: true, expiresAt: consent.expiresAt.toISOString() },
    }),
  );
}
