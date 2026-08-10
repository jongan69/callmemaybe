import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const settings = await prisma.shopSettings.findUnique({
    where: { shopDomain: session.shop },
  });

  const proposals = await prisma.resolutionProposal.findMany({
    where: {
      status: "PENDING",
      requiresApproval: true,
      supportCase: {
        shopId: settings?.id ?? "",
        status: "AWAITING_APPROVAL",
      },
    },
    include: {
      supportCase: {
        select: {
          publicReference: true,
          shopifyOrderName: true,
          issueType: true,
          customerPhoneLastFour: true,
          createdAt: true,
          callAttempts: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { summary: true, completionConfidenceScore: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    approvals: proposals.map((p) => ({
      id: p.id,
      caseReference: p.supportCase.publicReference,
      orderName: p.supportCase.shopifyOrderName,
      issueType: p.supportCase.issueType,
      actionType: p.actionType,
      riskLevel: p.riskLevel,
      phoneLastFour: p.supportCase.customerPhoneLastFour,
      callSummary: p.supportCase.callAttempts[0]?.summary ?? null,
      confidence:
        p.supportCase.callAttempts[0]?.completionConfidenceScore ?? null,
      createdAt: p.createdAt.toISOString(),
    })),
  };
};

export default function Approvals() {
  const { approvals } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Pending approvals">
      <s-section heading="Cases requiring your approval">
        {approvals.length === 0 ? (
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-text>
              No pending approvals. All cases have been resolved or are in
              progress.
            </s-text>
          </s-box>
        ) : (
          approvals.map((approval) => (
            <s-box
              key={approval.id}
              padding="base"
              borderWidth="base"
              borderRadius="base"
            >
              <s-stack direction="inline" gap="base">
                <s-stack direction="block" gap="base">
                  <s-heading>
                    {approval.caseReference} -{" "}
                    {approval.issueType.replace(/_/g, " ")}
                  </s-heading>
                  <s-text>
                    Order: {approval.orderName} | Phone: ***-***-
                    {approval.phoneLastFour}
                  </s-text>
                  <s-text>
                    Action: {approval.actionType.replace(/_/g, " ")}
                  </s-text>
                  {approval.riskLevel && (
                    <s-badge
                      tone={
                        approval.riskLevel === "HIGH" ||
                        approval.riskLevel === "CRITICAL"
                          ? "critical"
                          : "info"
                      }
                    >
                      Risk: {approval.riskLevel}
                    </s-badge>
                  )}
                  {approval.callSummary && (
                    <s-box
                      padding="base"
                      background="subdued"
                      borderRadius="base"
                    >
                      <s-heading>Call summary:</s-heading>
                      <s-text>{approval.callSummary}</s-text>
                    </s-box>
                  )}
                </s-stack>
                <s-stack direction="block" gap="base">
                  {approval.confidence !== null && (
                    <s-text>
                      Confidence: {Math.round(approval.confidence * 100)}%
                    </s-text>
                  )}
                  <s-link href={`/app/cases/${approval.caseReference}`}>
                    Review case
                  </s-link>
                </s-stack>
              </s-stack>
            </s-box>
          ))
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
