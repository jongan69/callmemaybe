import type { ActionFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import {
  createSupportCase,
  buildCallPlan,
  submitCall,
} from "../services/support-case.server";
import {
  fetchOrderContext,
  buildOrderSnapshot,
} from "../services/shopify-adapter.server";
import { ErrorCodes, createError, errorToResponse } from "../lib/errors.server";
import { redactPhone } from "../lib/crypto.server";
import prisma from "../db.server";

// Customer-facing endpoint, called from the customer-account UI extension.
//
// Everything about the caller is taken from the validated session token, never
// from the request body or a header. The body only says what the customer wants
// done; who they are, which shop they belong to, and what state the order is
// actually in are all established server-side.

export async function action({ request }: ActionFunctionArgs) {
  // Validates the JWT signature, expiry, and audience against the app's API
  // secret. Throws a 401 Response if the token is missing, forged, or expired.
  const { sessionToken, cors } = await authenticate.public.customerAccount(request);

  if (request.method !== "POST") {
    return cors(
      Response.json({ error: "Method not allowed" }, { status: 405 }),
    );
  }

  try {
    // `dest` is the shop the token was issued for; `sub` is the authenticated
    // customer. Neither can be set by the caller.
    const shopDomain = String(sessionToken.dest ?? "").replace(/^https?:\/\//, "");
    const customerId = String(sessionToken.sub ?? "");

    if (!shopDomain || !customerId) {
      return cors(
        Response.json(
          errorToResponse(
            createError(
              ErrorCodes.CUSTOMER_NOT_AUTHENTICATED,
              "Session token is missing dest or sub",
              "Please sign in again.",
            ),
          ),
          { status: 401 },
        ),
      );
    }

    const body = await request.json();
    const { orderId, issueType, consentGiven, customerPhone: rawPhone } = body;

    if (!orderId || !issueType) {
      return cors(
        Response.json(
          errorToResponse(
            createError(
              "VALIDATION_ERROR",
              "Missing required fields",
              "Please provide all required information.",
              {
                fieldErrors: {
                  ...(!orderId ? { orderId: ["Required"] } : {}),
                  ...(!issueType ? { issueType: ["Required"] } : {}),
                },
              },
            ),
          ),
          { status: 400 },
        ),
      );
    }

    if (!consentGiven) {
      return cors(
        Response.json(
          errorToResponse(
            createError(
              ErrorCodes.CONSENT_REQUIRED,
              "Consent required",
              "You must consent to receive an AI support call.",
            ),
          ),
          { status: 400 },
        ),
      );
    }

    const phone = normalizeE164(rawPhone);
    if (!phone) {
      return cors(
        Response.json(
          errorToResponse(
            createError(
              ErrorCodes.PHONE_INVALID,
              "Invalid phone number",
              "Please provide a valid phone number.",
            ),
          ),
          { status: 400 },
        ),
      );
    }

    const settings = await prisma.shopSettings.findFirst({
      where: { shopDomain },
    });

    if (!settings) {
      return cors(
        Response.json(
          errorToResponse(
            createError(
              ErrorCodes.SHOP_NOT_FOUND,
              "Shop not configured",
              "This store has not configured CallmeMaybe yet.",
            ),
          ),
          { status: 404 },
        ),
      );
    }

    // Read the order from Shopify rather than trusting the client's description
    // of it. This is both an ownership check and the snapshot the policy engine
    // and the pre-execution drift check are evaluated against — a client-supplied
    // snapshot would let a caller claim an order is unfulfilled to get past
    // policy, and would make the drift check meaningless.
    const { admin } = await unauthenticated.admin(shopDomain);

    let orderSnapshot;
    let orderName: string;
    try {
      const order = await fetchOrderContext(admin, orderId);
      orderSnapshot = buildOrderSnapshot(order);
      orderName = order.orderName;
    } catch {
      return cors(
        Response.json(
          errorToResponse(
            createError(
              ErrorCodes.ORDER_NOT_FOUND,
              `Order ${orderId} could not be read for shop ${shopDomain}`,
              "We couldn't find that order.",
            ),
          ),
          { status: 404 },
        ),
      );
    }

    const result = await createSupportCase({
      shopId: settings.id,
      shopDomain: settings.shopDomain,
      shopifyOrderId: orderId,
      shopifyOrderName: orderName,
      shopifyCustomerId: customerId,
      issueType,
      customerPhone: phone,
      customerName: body.customerName,
      customerEmail: body.customerEmail,
      orderSnapshot,
      ipHash: request.headers.get("X-Forwarded-For") ?? undefined,
      userAgent: request.headers.get("User-Agent") ?? undefined,
    });

    const callPlan = await buildCallPlan({
      supportCaseId: result.caseId,
      shopId: settings.id,
      storeName: settings.storeName,
      agentName: settings.agentName,
      issueType,
      customerPhone: phone,
      region: "US",
      locale: settings.defaultLocale,
      verificationCode: result.verificationCode,
      orderSnapshot,
      orderName,
    });

    const call = await submitCall({
      supportCaseId: result.caseId,
      callPlanId: callPlan.callPlanId,
      shopId: settings.id,
    });

    return cors(
      Response.json(
        {
          caseReference: result.publicReference,
          verificationCode: result.verificationCode,
          codeExpiresAt: result.expiresAt,
          callAttemptId: call.callAttemptId,
          callStatus: call.status,
          maskedPhone: redactPhone(phone),
        },
        { status: 201 },
      ),
    );
  } catch (error: unknown) {
    console.error("[CustomerSupportAPI] Error:", error);
    const appError = error as { code?: string; userMessage?: string };
    return cors(
      Response.json(
        {
          error: {
            code: appError.code ?? "INTERNAL_ERROR",
            message: appError.userMessage ?? "An unexpected error occurred.",
          },
        },
        { status: 500 },
      ),
    );
  }
}

export async function loader({ request }: ActionFunctionArgs) {
  const { cors } = await authenticate.public.customerAccount(request);
  return cors(Response.json({ status: "ok" }));
}

function normalizeE164(phone: string): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) {
    return cleaned.length >= 10 ? cleaned : null;
  }
  if (cleaned.length === 10) return `+1${cleaned}`;
  if (cleaned.length === 11 && cleaned.startsWith("1")) return `+${cleaned}`;
  return null;
}
