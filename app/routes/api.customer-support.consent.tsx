import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import prisma from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";
import { fetchOrderContext } from "../services/shopify-adapter.server";
import {
  findActiveCallConsent,
  grantCallConsent,
  normalizePhone,
  revokeCallConsent,
} from "../services/consent.server";
import { consentText } from "../lib/regions";
import { hashForMatching } from "../lib/crypto.server";

const OrderIdSchema = z.string().regex(/^gid:\/\/shopify\/Order\/[^/?#]+$/);
const LocaleSchema = z.string().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/);
const CustomerConsentPayloadSchema = z
  .object({
    orderId: OrderIdSchema,
    intent: z.enum(["grant", "revoke"]),
    locale: LocaleSchema.optional(),
  })
  .strict();

async function context(request: Request, orderId: string) {
  const { sessionToken, cors } =
    await authenticate.public.customerAccount(request);
  const shopDomain = String(sessionToken.dest ?? "").replace(
    /^https?:\/\//,
    "",
  );
  const customerId = String(sessionToken.sub ?? "");
  if (!shopDomain || !customerId)
    throw new Response("Unauthorized", { status: 401 });
  const settings = await prisma.shopSettings.findUnique({
    where: { shopDomain },
  });
  if (!settings) throw new Response("Store not configured", { status: 404 });
  const { admin } = await unauthenticated.admin(shopDomain);
  const order = await fetchOrderContext(admin, orderId);
  if (!order.customerId || order.customerId !== customerId)
    throw new Response("Order not found", { status: 404 });
  const phone = normalizePhone(
    order.shippingAddress?.phone ?? order.customerPhone ?? "",
  );
  if (!phone)
    throw new Response("Supported phone number required", { status: 400 });
  return { cors, customerId, settings, order, phone };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const parsedOrderId = OrderIdSchema.safeParse(
    url.searchParams.get("orderId"),
  );
  if (!parsedOrderId.success)
    return Response.json({ error: "Invalid request" }, { status: 400 });
  const orderId = parsedOrderId.data;
  const { cors, customerId, settings, phone } = await context(request, orderId);
  const consent = await findActiveCallConsent({
    shopId: settings.id,
    shopifyOrderId: orderId,
    shopifyCustomerId: customerId,
    phone: phone.e164,
    purpose: "ORDER_SUPPORT",
  });
  return cors(
    Response.json({
      text: consentText(
        url.searchParams.get("locale") || settings.defaultLocale,
        settings.storeName,
      ),
      consent: consent
        ? {
            active: true,
            expiresAt: consent.expiresAt.toISOString(),
            maxAttempts: consent.maxAttempts,
            locale: consent.locale,
            region: consent.region,
          }
        : { active: false },
    }),
  );
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST")
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  const parsedBody = CustomerConsentPayloadSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsedBody.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const body = parsedBody.data;
  const { cors, customerId, settings, order, phone } = await context(
    request,
    body.orderId,
  );
  if (body.intent === "revoke") {
    const result = await revokeCallConsent({
      shopId: settings.id,
      shopifyOrderId: body.orderId,
      shopifyCustomerId: customerId,
      reason: "customer_account_revocation",
    });
    return cors(Response.json({ consent: { active: false }, ...result }));
  }
  const consent = await grantCallConsent({
    shopId: settings.id,
    shopifyOrderId: body.orderId,
    shopifyCustomerId: customerId,
    phone: phone.e164,
    purpose: "ORDER_SUPPORT",
    source: "customer_account",
    locale: body.locale || settings.defaultLocale,
    storeName: settings.storeName,
    sessionTokenSubject: customerId,
    ipHash: request.headers.get("X-Forwarded-For")
      ? hashForMatching(
          request.headers.get("X-Forwarded-For")!.split(",")[0].trim(),
        )
      : undefined,
    userAgentSummary:
      request.headers.get("User-Agent")?.slice(0, 240) ?? undefined,
  });
  return cors(
    Response.json({
      consent: { active: true, expiresAt: consent.expiresAt.toISOString() },
      orderName: order.orderName,
    }),
  );
}
