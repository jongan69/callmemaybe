import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getCasesForShop } from "../services/support-case.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const cases = await getCasesForShop(session.id);
  const openCases = cases.filter((c) =>
    ["REQUESTED", "PREPARING_CALL", "CALL_SUBMITTED", "CALLING", "PROCESSING_RESULT"].includes(c.status),
  ).length;
  const awaitingApproval = cases.filter((c) => c.status === "AWAITING_APPROVAL").length;
  const resolved = cases.filter((c) => c.status === "RESOLVED").length;
  const needsHuman = cases.filter((c) => c.status === "NEEDS_HUMAN").length;

  return {
    stats: { openCases, awaitingApproval, resolved, needsHuman, totalCases: cases.length },
    recentCases: cases.slice(0, 10).map((c) => ({
      id: c.publicReference,
      order: c.shopifyOrderName,
      issue: c.issueType,
      status: c.status,
      resolutionMode: c.resolutionMode,
      createdAt: c.createdAt.toISOString(),
    })),
  };
};

export const action = async () => {
  return { testCallInitiated: true };
};

export default function Overview() {
  const { stats, recentCases } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  return (
    <s-page heading="CallmeMaybe">
      <s-button
        slot="primary-action"
        onClick={() => fetcher.submit({ intent: "test_call" }, { method: "POST" })}
        variant="primary"
      >
        Test support call
      </s-button>

      <s-section heading="Overview">
        <s-stack direction="inline" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-heading>{stats.openCases}</s-heading>
            <s-text>Open cases</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-heading>{stats.awaitingApproval}</s-heading>
            <s-text>Awaiting approval</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-heading>{stats.resolved}</s-heading>
            <s-text>Resolved</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-heading>{stats.needsHuman}</s-heading>
            <s-text>Needs human</s-text>
          </s-box>
        </s-stack>
      </s-section>

      <s-section heading="Quick actions">
        <s-stack direction="inline" gap="base">
          <s-link href="/app/cases">View all cases</s-link>
          <s-link href="/app/approvals">Pending approvals</s-link>
          <s-link href="/app/settings">Configure automation</s-link>
        </s-stack>
      </s-section>

      <s-section heading="Recent cases">
        {recentCases.length === 0 ? (
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-text>No support cases yet. When customers request support calls, they will appear here.</s-text>
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
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {recentCases.map((c) => (
                <tr key={c.id}>
                  <td>
                    <s-link href={`/app/cases/${c.id}`}>{c.id}</s-link>
                  </td>
                  <td>{c.order}</td>
                  <td>
                    <s-badge>{c.issue.replace(/_/g, " ")}</s-badge>
                  </td>
                  <td>
                    <s-badge tone={c.status === "RESOLVED" ? "success" : c.status === "AWAITING_APPROVAL" ? "caution" : "info"}>
                      {c.status.replace(/_/g, " ")}
                    </s-badge>
                  </td>
                  <td>{c.resolutionMode ?? "—"}</td>
                  <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </s-table>
        )}
      </s-section>

      <s-section slot="aside" heading="About CallmeMaybe">
        <s-paragraph>
          CallmeMaybe gives your customers AI phone support for their orders.
        </s-paragraph>
        <s-paragraph>
          You control what the agent can resolve automatically, what requires your approval, and what gets escalated.
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Next steps">
        <s-unordered-list>
          <s-list-item>
            <s-link href="/app/settings">Configure your support settings</s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="/app/automations">Set up automation policies</s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
