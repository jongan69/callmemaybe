import type { LoaderFunctionArgs } from "react-router";
import { getSupportCase } from "../services/support-case.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  // Handle CORS preflight
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
    const reference = params.reference as string;
    const caseData = await getSupportCase(reference);

    if (!caseData) {
      return Response.json(
        { error: { code: "CASE_NOT_FOUND", message: "Case not found" } },
        {
          status: 404,
          headers: { "Access-Control-Allow-Origin": "*" },
        },
      );
    }

    return Response.json(
      {
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
      },
      {
        headers: { "Access-Control-Allow-Origin": "*" },
      },
    );
  } catch (error) {
    console.error("[CustomerCaseAPI] Error:", error);
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to retrieve case" } },
      {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      },
    );
  }
}
