import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getCasesForShop } from "../services/support-case.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const issueType = url.searchParams.get("issue") || undefined;

  const settings = await prisma.shopSettings.findUnique({
    where: { shopDomain: session.shop },
  });
  const cases = await getCasesForShop(settings?.id ?? "", {
    status,
    issueType,
  });

  return {
    cases: cases.map((c) => ({
      id: c.publicReference,
      order: c.shopifyOrderName,
      issue: c.issueType,
      status: c.status,
      resolutionMode: c.resolutionMode,
      riskLevel: c.riskLevel,
      latestCallStatus: c.callAttempts[0]?.status ?? null,
      createdAt: c.createdAt.toISOString(),
    })),
    filters: { status, issueType },
  };
};

export default function CasesList() {
  const { cases } = useLoaderData<typeof loader>();

  const statusBadge = (status: string) => {
    const tones: Record<string, string> = {
      RESOLVED: "success",
      AWAITING_APPROVAL: "caution",
      NEEDS_HUMAN: "critical",
      FAILED: "critical",
      CALLING: "info",
      CANCELED: "neutral",
    };
    const tone = (tones[status] ?? "info") as
      "success" | "caution" | "critical" | "info" | "neutral";
    return <s-badge tone={tone}>{status.replace(/_/g, " ")}</s-badge>;
  };

  return (
    <s-page heading="Support Cases">
      <s-section heading="All cases">
        <s-stack direction="inline" gap="base">
          <s-link href="/app/cases">All</s-link>
          <s-link href="/app/cases?status=AWAITING_APPROVAL">
            Awaiting Approval
          </s-link>
          <s-link href="/app/cases?status=NEEDS_HUMAN">Needs Human</s-link>
          <s-link href="/app/cases?status=RESOLVED">Resolved</s-link>
        </s-stack>

        {cases.length === 0 ? (
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-text>No cases found matching the current filters.</s-text>
          </s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Case</s-table-header>
              <s-table-header listSlot="labeled">Order</s-table-header>
              <s-table-header>Issue</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Resolution</s-table-header>
              <s-table-header>Risk</s-table-header>
              <s-table-header>Created</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {cases.map((c) => (
                <s-table-row key={c.id}>
                  <s-table-cell>
                    <s-link href={`/app/cases/${c.id}`}>{c.id}</s-link>
                  </s-table-cell>
                  <s-table-cell>{c.order}</s-table-cell>
                  <s-table-cell>
                    <s-badge>{c.issue.replace(/_/g, " ")}</s-badge>
                  </s-table-cell>
                  <s-table-cell>{statusBadge(c.status)}</s-table-cell>
                  <s-table-cell>{c.resolutionMode ?? "—"}</s-table-cell>
                  <s-table-cell>
                    {c.riskLevel ? (
                      <s-badge
                        tone={
                          c.riskLevel === "HIGH" || c.riskLevel === "CRITICAL"
                            ? "critical"
                            : "info"
                        }
                      >
                        {c.riskLevel}
                      </s-badge>
                    ) : (
                      "—"
                    )}
                  </s-table-cell>
                  <s-table-cell>
                    {new Date(c.createdAt).toLocaleDateString()}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
