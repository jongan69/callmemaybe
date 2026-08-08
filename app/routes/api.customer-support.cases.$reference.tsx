import type { LoaderFunctionArgs } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { getSupportCase } from "../services/support-case.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { sessionToken, cors } = await authenticate.public.customerAccount(request);

  try {
    const shopDomain = String(sessionToken.dest ?? "").replace(/^https?:\/\//, "");
    const customerId = String(sessionToken.sub ?? "");
    const settings = await prisma.shopSettings.findUnique({
      where: { shopDomain },
      select: { id: true },
    });

    if (!settings || !customerId) {
      return cors(Response.json(
        { error: { code: "CASE_NOT_FOUND", message: "Case not found" } },
        { status: 404 },
      ));
    }

    const reference = params.reference as string;
    const caseData = await getSupportCase(reference, {
      shopId: settings.id,
      customerId,
    });

    if (!caseData) {
      return cors(Response.json(
        { error: { code: "CASE_NOT_FOUND", message: "Case not found" } },
        { status: 404 },
      ));
    }

    return cors(Response.json({
      case: {
        reference: caseData.publicReference,
        status: caseData.status,
        issueType: caseData.issueType,
        resolutionMode: caseData.resolutionMode,
        phoneLastFour: caseData.customerPhoneLastFour,
        requestedAt: caseData.requestedAt?.toISOString(),
        resolvedAt: caseData.resolvedAt?.toISOString(),
        callStatus: caseData.latestCallAttempt?.status ?? null,
        callOutcome: caseData.latestCallAttempt?.outcome ?? null,
        summary: caseData.latestCallAttempt?.summary ?? null,
      },
    }));
  } catch (error) {
    console.error("[CustomerCaseAPI] Error:", error);
    return cors(Response.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to retrieve case" } },
      { status: 500 },
    ));
  }
}
