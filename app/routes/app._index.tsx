import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getCasesForShop } from "../services/support-case.server";
import prisma from "../db.server";
import { getProviderMode } from "../providers/index.server";
import { ensureShopSettings } from "../services/shop-settings.server";
import {
  BILLING_PLAN,
  getUsageSnapshot,
  getUsageWarnings,
} from "../services/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  // Ensure settings exist.
  const settings = await ensureShopSettings(admin, session.shop);

  const cases = await getCasesForShop(settings.id);
  const openCases = cases.filter((c) =>
    [
      "REQUESTED",
      "PREPARING_CALL",
      "CALL_SUBMITTED",
      "CALLING",
      "PROCESSING_RESULT",
    ].includes(c.status),
  ).length;
  const awaitingApproval = cases.filter(
    (c) => c.status === "AWAITING_APPROVAL",
  ).length;
  const resolved = cases.filter((c) => c.status === "RESOLVED").length;
  const needsHuman = cases.filter((c) => c.status === "NEEDS_HUMAN").length;
  const usage = await getUsageSnapshot(settings.id);
  const subscription = await prisma.shopSubscription.findUnique({
    where: { shopId: settings.id },
  });

  return {
    stats: {
      openCases,
      awaitingApproval,
      resolved,
      needsHuman,
      totalCases: cases.length,
    },
    providerMode: getProviderMode(),
    callingEnabled: settings.globalCallingEnabled,
    setupComplete: Boolean(
      settings.businessIdentity &&
      settings.termsAcceptedAt &&
      subscription &&
      ["ACTIVE", "TRIAL"].includes(subscription.status),
    ),
    billing: {
      status: subscription?.status ?? "NOT_APPROVED",
      completedCalls: usage.completedCalls,
      includedLimit: usage.includedLimit,
      overageMinor: usage.overageCalls * BILLING_PLAN.overageUnitPriceMinor,
      hardLimitReached: usage.hardLimitReached,
      warnings: getUsageWarnings(usage),
    },
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

export default function Overview() {
  const {
    stats,
    recentCases,
    providerMode,
    callingEnabled,
    setupComplete,
    billing,
  } = useLoaderData<typeof loader>();

  return (
    <s-page heading="CallMeMaybe">
      <s-button slot="primary-action" href="/app/outreach" variant="primary">
        Review outreach
      </s-button>

      <s-section heading="Phone work, safely resolved">
        {!setupComplete && (
          <s-banner tone="warning">
            <s-text>
              Complete pricing, legal, and regional setup before recording a
              live-call demo.
            </s-text>
          </s-banner>
        )}
        {!callingEnabled && (
          <s-banner tone="info">
            <s-text>The store call switch is off. No calls can start.</s-text>
          </s-banner>
        )}
        {billing.hardLimitReached && (
          <s-banner tone="critical">
            <s-text>The 2,250-call monthly ceiling is active.</s-text>
          </s-banner>
        )}
        {billing.warnings.map((warning) => (
          <s-banner
            key={warning.scope}
            tone={warning.threshold >= 100 ? "critical" : "warning"}
          >
            <s-text>
              {warning.threshold}% {warning.scope} usage warning:{" "}
              {warning.percentage}% used.
            </s-text>
          </s-banner>
        ))}
        <s-paragraph>
          Call carriers when there is no API, reach customers when email stalls,
          and turn each conversation into structured evidence. The model talks;
          your policy decides; a merchant approves consequential changes.
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-badge tone={providerMode === "calle" ? "success" : "info"}>
            {providerMode === "calle" ? "CALL-E live" : "Safe fixture mode"}
          </s-badge>
          <s-text>{stats.totalCases} total cases</s-text>
          <s-text>
            {billing.completedCalls}/{billing.includedLimit} included calls · $
            {(billing.overageMinor / 100).toFixed(2)} overage · {billing.status}
          </s-text>
        </s-stack>
      </s-section>

      <s-section heading="Overview">
        <s-stack direction="inline" gap="base">
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-heading>{stats.openCases}</s-heading>
            <s-text>Open cases</s-text>
          </s-box>
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-heading>{stats.awaitingApproval}</s-heading>
            <s-text>Awaiting approval</s-text>
          </s-box>
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-heading>{stats.resolved}</s-heading>
            <s-text>Resolved</s-text>
          </s-box>
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
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
          <s-link href="/app/outreach">Call about a live order</s-link>
        </s-stack>
      </s-section>

      <s-section heading="Recent cases">
        {recentCases.length === 0 ? (
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-text>
              No support cases yet. When customers request support calls, they
              will appear here.
            </s-text>
          </s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Case</s-table-header>
              <s-table-header listSlot="labeled">Order</s-table-header>
              <s-table-header>Issue</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Resolution</s-table-header>
              <s-table-header>Created</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {recentCases.map((c) => (
                <s-table-row key={c.id}>
                  <s-table-cell>
                    <s-link href={`/app/cases/${c.id}`}>{c.id}</s-link>
                  </s-table-cell>
                  <s-table-cell>{c.order}</s-table-cell>
                  <s-table-cell>
                    <s-badge>{c.issue.replace(/_/g, " ")}</s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    <s-badge
                      tone={
                        c.status === "RESOLVED"
                          ? "success"
                          : c.status === "AWAITING_APPROVAL"
                            ? "caution"
                            : "info"
                      }
                    >
                      {c.status.replace(/_/g, " ")}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>{c.resolutionMode ?? "—"}</s-table-cell>
                  <s-table-cell>
                    {new Date(c.createdAt).toLocaleDateString()}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section slot="aside" heading="About CallMeMaybe">
        <s-paragraph>
          CallMeMaybe gives your customers consent-based AI phone support for
          their orders.
        </s-paragraph>
        <s-paragraph>
          Informational outcomes can close without changing Shopify. Address,
          cancellation, note, return, refund, and replacement proposals require
          merchant review before any supported action runs.
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Next steps">
        <s-unordered-list>
          <s-list-item>
            <s-link href="/app/settings">
              Configure your support settings
            </s-link>
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
