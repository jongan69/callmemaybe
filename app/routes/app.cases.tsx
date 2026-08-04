import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getCasesForShop } from "../services/support-case.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const issueType = url.searchParams.get("issue") || undefined;

  const cases = await getCasesForShop(session.id, { status, issueType });

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
    const tone = (tones[status] ?? "info") as "success" | "caution" | "critical" | "info" | "neutral";
    return <s-badge tone={tone}>{status.replace(/_/g, " ")}</s-badge>;
  };

  return (
    <s-page heading="Support Cases">
      <s-section heading="All cases">
        <s-stack direction="inline" gap="base">
          <s-link href="/app/cases">All</s-link>
          <s-link href="/app/cases?status=AWAITING_APPROVAL">Awaiting Approval</s-link>
          <s-link href="/app/cases?status=NEEDS_HUMAN">Needs Human</s-link>
          <s-link href="/app/cases?status=RESOLVED">Resolved</s-link>
        </s-stack>

        {cases.length === 0 ? (
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-text>No cases found matching the current filters.</s-text>
          </s-box>
        ) : (
          <s-table>
            <thead>
              <tr>
                <th>Case</th>
                <th>Order</th>
                <th>Issue</th>
                <th>Status</th>
                <th>Resolution</th>
                <th>Risk</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td><s-link href={`/app/cases/${c.id}`}>{c.id}</s-link></td>
                  <td>{c.order}</td>
                  <td><s-badge>{c.issue.replace(/_/g, " ")}</s-badge></td>
                  <td>{statusBadge(c.status)}</td>
                  <td>{c.resolutionMode ?? "—"}</td>
                  <td>{c.riskLevel ? <s-badge tone={c.riskLevel === "HIGH" || c.riskLevel === "CRITICAL" ? "critical" : "info"}>{c.riskLevel}</s-badge> : "—"}</td>
                  <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
