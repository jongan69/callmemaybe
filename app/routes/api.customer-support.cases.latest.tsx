import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  try {
    const url = new URL(request.url);
    const orderId = url.searchParams.get("orderId");

    if (!orderId) {
      return Response.json(
        { error: { code: "VALIDATION_ERROR", message: "orderId is required" } },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } },
      );
    }

    const case_ = await prisma.supportCase.findFirst({
      where: {
        shopifyOrderId: orderId,
        status: { notIn: ["CLOSED", "CANCELED"] },
      },
      orderBy: { createdAt: "desc" },
      include: {
        callAttempts: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    if (!case_) {
      return Response.json(
        { case: null },
        { headers: { "Access-Control-Allow-Origin": "*" } },
      );
    }

    return Response.json(
      {
        case: {
          reference: case_.publicReference,
          status: case_.status,
          issueType: case_.issueType,
          callStatus: case_.callAttempts[0]?.status ?? null,
          callOutcome: case_.callAttempts[0]?.outcome ?? null,
          createdAt: case_.createdAt.toISOString(),
        },
      },
      { headers: { "Access-Control-Allow-Origin": "*" } },
    );
  } catch (error) {
    return Response.json(
      { case: null },
      { headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }
}
