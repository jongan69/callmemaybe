import type { LoaderFunctionArgs } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { sessionToken, cors } = await authenticate.public.customerAccount(request);

  try {
    const url = new URL(request.url);
    const orderId = url.searchParams.get("orderId");
    const shopDomain = String(sessionToken.dest ?? "").replace(/^https?:\/\//, "");
    const customerId = String(sessionToken.sub ?? "");

    if (!orderId || !customerId) {
      return cors(Response.json(
        { error: { code: "VALIDATION_ERROR", message: "orderId is required" } },
        { status: 400 },
      ));
    }

    const settings = await prisma.shopSettings.findUnique({
      where: { shopDomain },
      select: { id: true },
    });

    if (!settings) {
      return cors(Response.json({ case: null }));
    }

    const case_ = await prisma.supportCase.findFirst({
      where: {
        shopId: settings.id,
        shopifyCustomerId: customerId,
        shopifyOrderId: orderId,
        status: { notIn: ["CLOSED", "CANCELED"] },
      },
      orderBy: { createdAt: "desc" },
      include: {
        callAttempts: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    if (!case_) {
      return cors(Response.json({ case: null }));
    }

    return cors(Response.json({
      case: {
        reference: case_.publicReference,
        status: case_.status,
        issueType: case_.issueType,
        callStatus: case_.callAttempts[0]?.status ?? null,
        callOutcome: case_.callAttempts[0]?.outcome ?? null,
        createdAt: case_.createdAt.toISOString(),
      },
    }));
  } catch (error) {
    console.error("[CustomerLatestCaseAPI] Error:", error);
    return cors(Response.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to retrieve case" } },
      { status: 500 },
    ));
  }
}
