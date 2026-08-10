import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getShopPolicies } from "../services/policy.server";
import prisma from "../db.server";
import { DEFAULT_POLICIES } from "../lib/types";

const SAFE_AUTOMATIC_ISSUES = new Set(["ORDER_STATUS", "PRODUCT_HELP"]);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  let settings = await prisma.shopSettings.findUnique({
    where: { shopDomain: session.shop },
  });
  if (!settings) {
    settings = await prisma.shopSettings.create({
      data: { shopDomain: session.shop, shopifyShopId: session.id },
    });
  }

  for (const policy of DEFAULT_POLICIES) {
    await prisma.supportPolicy.upsert({
      where: {
        shopId_issueType: { shopId: settings.id, issueType: policy.issueType },
      },
      create: {
        shopId: settings.id,
        issueType: policy.issueType,
        enabled: policy.enabled,
        mode: policy.mode,
        conditionsJson: JSON.stringify(policy),
      },
      update: {},
    });
  }

  const policies = await getShopPolicies(settings.id);
  return {
    policies: policies.map((p) => ({
      issueType: p.issueType,
      enabled: p.enabled,
      mode: p.mode,
      customInstructions: p.customInstructions ?? "",
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const settings = await prisma.shopSettings.findUnique({
    where: { shopDomain: session.shop },
  });
  if (!settings) throw new Error("Shop settings not found");

  const issueType = formData.get("issueType") as string;
  const requestedMode = String(formData.get("mode") ?? "APPROVAL");
  const validModes = new Set([
    "AUTOMATIC",
    "APPROVAL",
    "INFORMATIONAL",
    "DISABLED",
  ]);
  if (!validModes.has(requestedMode)) {
    return { saved: false, error: "Unsupported policy mode." };
  }
  if (requestedMode === "AUTOMATIC" && !SAFE_AUTOMATIC_ISSUES.has(issueType)) {
    return {
      saved: false,
      error: "Shopify-changing actions always require merchant approval.",
    };
  }
  const mode = requestedMode;
  const enabled = mode !== "DISABLED";

  await prisma.supportPolicy.upsert({
    where: { shopId_issueType: { shopId: settings.id, issueType } },
    create: { shopId: settings.id, issueType, enabled, mode },
    update: { enabled, mode },
  });

  return { saved: true, error: null };
};

const ISSUE_LABELS: Record<string, string> = {
  ORDER_STATUS: "Order status & tracking",
  ADDRESS_CHANGE: "Shipping address change",
  CANCELLATION: "Order cancellation",
  RETURN: "Return request",
  DAMAGED_ITEM: "Damaged item",
  WRONG_ITEM: "Wrong item received",
  MISSING_ITEM: "Missing item",
  PRODUCT_HELP: "Product help",
  CARRIER_TRACE: "Carrier package trace",
  STUCK_ORDER_OUTREACH: "Stuck-order customer outreach",
  OTHER: "Other inquiries",
};

export default function Automations() {
  const { policies } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  return (
    <s-page heading="Automation policies">
      <s-section heading="Configure what the AI agent can do automatically">
        <s-text>
          Informational work can resolve automatically. Any action that writes
          to Shopify always requires merchant approval, even if a stored policy
          is misconfigured.
        </s-text>

        {policies.map((policy) => (
          <s-box
            key={policy.issueType}
            padding="base"
            borderWidth="base"
            borderRadius="base"
          >
            <s-stack direction="inline" gap="base">
              <s-stack direction="block" gap="none">
                <s-heading>
                  {ISSUE_LABELS[policy.issueType] ?? policy.issueType}
                </s-heading>
                <s-badge
                  tone={
                    policy.mode === "AUTOMATIC"
                      ? "success"
                      : policy.mode === "APPROVAL"
                        ? "caution"
                        : policy.mode === "INFORMATIONAL"
                          ? "info"
                          : "neutral"
                  }
                >
                  {policy.mode}
                </s-badge>
                {!policy.enabled && <s-badge tone="critical">Disabled</s-badge>}
              </s-stack>

              <s-stack direction="inline" gap="base">
                {[
                  ["AUTOMATIC", "Auto"],
                  ["APPROVAL", "Approval"],
                  ["INFORMATIONAL", "Inform"],
                  ["DISABLED", "Disable"],
                ].map(([mode, label]) => {
                  const automaticUnavailable =
                    mode === "AUTOMATIC" &&
                    !SAFE_AUTOMATIC_ISSUES.has(policy.issueType);
                  return (
                    <fetcher.Form method="POST" key={mode}>
                      <input
                        type="hidden"
                        name="issueType"
                        value={policy.issueType}
                      />
                      <input type="hidden" name="mode" value={mode} />
                      <s-button
                        type="submit"
                        disabled={
                          automaticUnavailable ||
                          (policy.mode === mode && policy.enabled)
                        }
                      >
                        {label}
                      </s-button>
                    </fetcher.Form>
                  );
                })}
              </s-stack>
            </s-stack>
          </s-box>
        ))}

        {fetcher.data?.saved && (
          <s-banner tone="success">Policy updated successfully</s-banner>
        )}
        {fetcher.data?.error && (
          <s-banner tone="critical">
            <s-text>{fetcher.data.error}</s-text>
          </s-banner>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
