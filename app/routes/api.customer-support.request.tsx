import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { authenticate, unauthenticated } from "../shopify.server";
import {
  createSupportCase,
  buildCallPlan,
} from "../services/support-case.server";
import {
  fetchOrderContext,
  buildOrderSnapshot,
} from "../services/shopify-adapter.server";
import {
  ErrorCodes,
  createError,
  errorToResponse,
  isApplicationError,
} from "../lib/errors.server";
import { hashForMatching, redactPhone } from "../lib/crypto.server";
import {
  findActiveCallConsent,
  normalizePhone,
} from "../services/consent.server";
import prisma from "../db.server";
import { enqueueJob, JOBS } from "../queue.server";
import { captureOperationalError } from "../services/observability.server";
import { logEvent } from "../services/logger.server";

const CustomerSupportRequestSchema = z
  .object({
    orderId: z.string().regex(/^gid:\/\/shopify\/Order\/[^/?#]+$/),
    issueType: z.enum([
      "ORDER_STATUS",
      "ADDRESS_CHANGE",
      "CANCELLATION",
      "RETURN",
      "DAMAGED_ITEM",
      "WRONG_ITEM",
      "MISSING_ITEM",
      "PRODUCT_HELP",
      "OTHER",
    ]),
    locale: z
      .string()
      .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)
      .optional(),
  })
  .strict();

// Customer-facing endpoint, called from the customer-account UI extension.
//
// Everything about the caller is taken from the validated session token, never
// from the request body or a header. The body only says what the customer wants
// done; who they are, which shop they belong to, and what state the order is
// actually in are all established server-side.

export async function action({ request }: ActionFunctionArgs) {
  // Validates the JWT signature, expiry, and audience against the app's API
  // secret. Throws a 401 Response if the token is missing, forged, or expired.
  const { sessionToken, cors } =
    await authenticate.public.customerAccount(request);

  if (request.method !== "POST") {
    return cors(
      Response.json({ error: "Method not allowed" }, { status: 405 }),
    );
  }

  try {
    // `dest` is the shop the token was issued for; `sub` is the authenticated
    // customer. Neither can be set by the caller.
    const shopDomain = String(sessionToken.dest ?? "").replace(
      /^https?:\/\//,
      "",
    );
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

    const parsedBody = CustomerSupportRequestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsedBody.success) {
      return cors(
        Response.json(
          errorToResponse(
            createError(
              "VALIDATION_ERROR",
              "Invalid customer support request",
              "Please check the request and try again.",
            ),
          ),
          { status: 400 },
        ),
      );
    }
    const { orderId, issueType, locale } = parsedBody.data;

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
              "This store has not configured CallMeMaybe yet.",
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

    let order;
    try {
      order = await fetchOrderContext(admin, orderId);
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

    // The token's `sub` is the signed customer GID. A valid token for one
    // customer must never be enough to open or inspect a case for another
    // customer's order.
    if (!order.customerId || order.customerId !== customerId) {
      return cors(
        Response.json(
          errorToResponse(
            createError(
              ErrorCodes.ORDER_NOT_FOUND,
              `Order ${orderId} does not belong to customer ${customerId}`,
              "We couldn't find that order.",
            ),
          ),
          { status: 404 },
        ),
      );
    }

    const phoneData = normalizePhone(
      order.shippingAddress?.phone ?? order.customerPhone ?? "",
    );
    if (!phoneData) {
      return cors(
        Response.json(
          errorToResponse(
            createError(
              ErrorCodes.PHONE_INVALID,
              "The order has no valid phone number",
              "Add a valid phone number to your account or contact the store for help.",
            ),
          ),
          { status: 400 },
        ),
      );
    }

    const orderSnapshot = buildOrderSnapshot(order);
    const orderName = order.orderName;
    const ipHash = request.headers.get("X-Forwarded-For")
      ? hashForMatching(
          request.headers.get("X-Forwarded-For")!.split(",")[0].trim(),
        )
      : undefined;
    const consent = await findActiveCallConsent({
      shopId: settings.id,
      shopifyOrderId: orderId,
      shopifyCustomerId: customerId,
      phone: phoneData.e164,
      purpose: "ORDER_SUPPORT",
    });
    if (!consent) {
      return cors(
        Response.json(
          errorToResponse(
            createError(
              ErrorCodes.CONSENT_REQUIRED,
              "No active consent record exists for this order and phone",
              "Save call consent before requesting a support call.",
            ),
          ),
          { status: 400 },
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
      customerPhone: phoneData.e164,
      customerName:
        order.shippingAddress?.name ?? order.customerName ?? undefined,
      consentId: consent.id,
      orderSnapshot,
      ipHash,
      userAgent: request.headers.get("User-Agent")?.slice(0, 240) ?? undefined,
    });

    const callPlan = await buildCallPlan({
      supportCaseId: result.caseId,
      shopId: settings.id,
      storeName: settings.storeName,
      agentName: settings.agentName,
      issueType,
      customerPhone: phoneData.e164,
      region: phoneData.region,
      locale: locale || settings.defaultLocale,
      verificationCode: result.verificationCode,
      orderSnapshot,
      orderName,
    });

    const queueJobId = await enqueueJob(
      JOBS.CALL_PLACEMENT,
      {
        supportCaseId: result.caseId,
        callPlanId: callPlan.callPlanId,
        shopId: settings.id,
      },
      `call-plan:${callPlan.callPlanId}`,
    );
    await prisma.supportCase.update({
      where: { id: result.caseId },
      data: { status: "CALL_SUBMITTED" },
    });

    return cors(
      Response.json(
        {
          caseReference: result.publicReference,
          verificationCode: result.verificationCode,
          codeExpiresAt: result.expiresAt,
          queueJobId,
          callStatus: "QUEUED",
          maskedPhone: redactPhone(phoneData.e164),
        },
        { status: 201 },
      ),
    );
  } catch (error: unknown) {
    captureOperationalError(error, {
      event: "customer_support.request_failed",
    });
    logEvent("error", "customer_support.request_failed");
    const appError = isApplicationError(error) ? error : null;
    const status = appError
      ? new Set<string>([
          ErrorCodes.CONSENT_REQUIRED,
          ErrorCodes.PHONE_INVALID,
          ErrorCodes.POLICY_BLOCKED,
        ]).has(appError.code)
        ? 400
        : appError.code === ErrorCodes.RATE_LIMITED
          ? 429
          : appError.code === ErrorCodes.DUPLICATE_CASE
            ? 409
            : 500
      : 500;
    return cors(
      Response.json(
        {
          error: {
            code: appError?.code ?? "INTERNAL_ERROR",
            message: appError?.userMessage ?? "An unexpected error occurred.",
          },
        },
        { status },
      ),
    );
  }
}

export async function loader({ request }: ActionFunctionArgs) {
  const { cors } = await authenticate.public.customerAccount(request);
  return cors(Response.json({ status: "ok" }));
}
