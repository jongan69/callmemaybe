import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getProviderMode } from "../providers/index.server";
import { syncShopPolicies } from "../services/knowledge.server";
import { ensureShopSettings } from "../services/shop-settings.server";
import {
  BILLING_PLAN,
  getUsageSnapshot,
  getUsageWarnings,
  hasActiveEntitlement,
  synchronizeSubscription,
} from "../services/billing.server";
import { encrypt, hashForMatching, lastFour } from "../lib/crypto.server";
import { normalizePhone } from "../services/consent.server";
import {
  CALL_SCRIPT_VERSION,
  REGION_DEFINITIONS,
  SUPPORTED_LOCALES,
  resolveRegionPolicyTimeZone,
} from "../lib/regions";
import { publicConfiguration } from "../services/public-config.server";

function parseRegions(value: string): string[] {
  try {
    const result = JSON.parse(value);
    return Array.isArray(result)
      ? result.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const { legalVersion } = publicConfiguration();
  const settings = await ensureShopSettings(admin, session.shop);
  const [
    usage,
    subscription,
    policies,
    carrierEndpoints,
    knowledgeCount,
    latestKnowledge,
    privacyRequests,
    activeConsents,
    suppressions,
  ] = await Promise.all([
    getUsageSnapshot(settings.id),
    prisma.shopSubscription.findUnique({ where: { shopId: settings.id } }),
    prisma.regionPolicy.findMany({ orderBy: { countryName: "asc" } }),
    prisma.carrierEndpoint.findMany({
      where: { shopId: settings.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.knowledgeSource.count({
      where: { shopId: settings.id, status: "active" },
    }),
    prisma.knowledgeSource.findFirst({
      where: { shopId: settings.id, status: "active" },
      orderBy: { syncedAt: "desc" },
      select: { syncedAt: true },
    }),
    prisma.privacyRequest.findMany({
      where: { shopDomain: session.shop },
      orderBy: { receivedAt: "desc" },
      take: 10,
      select: {
        id: true,
        topic: true,
        status: true,
        receivedAt: true,
        expiresAt: true,
      },
    }),
    prisma.callConsent.count({
      where: {
        shopId: settings.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    }),
    prisma.suppressionEntry.count({ where: { shopId: settings.id } }),
  ]);
  const enabledRegions = parseRegions(settings.enabledRegionsJson);
  const approvedPolicies = policies.filter(
    (policy) =>
      policy.enabled &&
      policy.legalApprovedAt &&
      policy.productionApprovedAt &&
      policy.effectiveAt &&
      policy.effectiveAt <= new Date() &&
      policy.calleLineId &&
      policy.legalApprovalReference &&
      policy.vendorApprovalReference &&
      policy.localizationApprovedAt &&
      policy.localizationApprovalReference &&
      resolveRegionPolicyTimeZone(policy.timezoneStrategy) &&
      policy.callScriptVersion === CALL_SCRIPT_VERSION &&
      !policy.disabledAt,
  );
  const approvedCodes = new Set(
    approvedPolicies.map((policy) => policy.countryCode),
  );
  const hasEntitlement = await hasActiveEntitlement(settings.id);
  return {
    settings: {
      storeName: settings.storeName,
      businessIdentity: settings.businessIdentity,
      supportDepartmentName: settings.supportDepartmentName,
      agentName: settings.agentName,
      timezone: settings.timezone,
      defaultLocale: settings.defaultLocale,
      humanEscalationEmail: settings.humanEscalationEmail,
      globalCallingEnabled: settings.globalCallingEnabled,
      enabledRegions,
      termsAccepted:
        settings.termsVersion === legalVersion &&
        Boolean(settings.termsAcceptedAt),
      confidenceThreshold: settings.confidenceThreshold,
      maxCallsPerCustomerPerDay: settings.maxCallsPerCustomerPerDay,
      maxConcurrentCalls: settings.maxConcurrentCalls,
    },
    runtime: {
      providerMode: getProviderMode(),
      calleConfigured: Boolean(process.env.CALLE_API_KEY),
      realCallsEnabled: process.env.CALLE_REAL_CALLS_ENABLED === "true",
    },
    billing: {
      status: subscription?.status ?? "NOT_APPROVED",
      hasEntitlement,
      cycleStart: usage.start.toISOString(),
      cycleEnd: usage.end.toISOString(),
      trial: usage.trial,
      completedCalls: usage.completedCalls,
      includedLimit: usage.includedLimit,
      overageCalls: usage.overageCalls,
      remainingCalls: usage.remainingCalls,
      hardLimitReached: usage.hardLimitReached,
      estimatedOverageMinor:
        usage.overageCalls * BILLING_PLAN.overageUnitPriceMinor,
      warnings: getUsageWarnings(usage),
    },
    regions: REGION_DEFINITIONS.map((definition) => {
      const policy = policies.find(
        (candidate) => candidate.countryCode === definition.countryCode,
      );
      return {
        ...definition,
        approved: approvedCodes.has(definition.countryCode),
        legalReference: policy?.legalApprovalReference ?? null,
        vendorReference: policy?.vendorApprovalReference ?? null,
      };
    }),
    carrierEndpoints: carrierEndpoints.map((endpoint) => ({
      id: endpoint.id,
      carrierName: endpoint.carrierName,
      countryCode: endpoint.countryCode,
      phoneLastFour: endpoint.phoneLastFour,
      enabled: endpoint.enabled,
      verifiedAt: endpoint.verifiedAt?.toISOString() ?? null,
      verificationReference: endpoint.verificationReference,
    })),
    operational: { activeConsents, suppressions },
    knowledge: {
      count: knowledgeCount,
      latest: latestKnowledge?.syncedAt.toISOString() ?? null,
    },
    privacyRequests,
    setupComplete:
      Boolean(settings.businessIdentity) &&
      settings.termsVersion === legalVersion &&
      Boolean(settings.termsAcceptedAt) &&
      hasEntitlement &&
      enabledRegions.some((code) => approvedCodes.has(code)),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const { legalVersion } = publicConfiguration();
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "save");
  const settings = await ensureShopSettings(admin, session.shop);

  if (intent === "sync_policies") {
    const result = await syncShopPolicies(admin, settings.id);
    return { synced: result.synced, error: result.errors.join("; ") || null };
  }
  if (intent === "sync_subscription") {
    try {
      await synchronizeSubscription({
        shopId: settings.id,
        shopifyShopId: settings.shopifyShopId,
      });
      return { subscriptionSynced: true };
    } catch {
      return {
        error:
          "Subscription status could not be synchronized. Try again or contact support.",
      };
    }
  }
  if (intent === "global_stop") {
    await prisma.shopSettings.update({
      where: { id: settings.id },
      data: { globalCallingEnabled: false },
    });
    return { stopped: true };
  }
  if (intent === "submit_carrier") {
    const carrierName = String(formData.get("carrierName") ?? "").trim();
    const normalized = normalizePhone(
      String(formData.get("carrierPhone") ?? "").trim(),
    );
    const verificationReference = String(
      formData.get("verificationReference") ?? "",
    ).trim();
    if (!carrierName || !normalized || !verificationReference) {
      return {
        error:
          "Carrier name, supported E.164 number, and an official source URL are required.",
      };
    }
    const phoneHash = hashForMatching(normalized.e164);
    await prisma.carrierEndpoint.upsert({
      where: { shopId_phoneHash: { shopId: settings.id, phoneHash } },
      create: {
        shopId: settings.id,
        carrierName,
        phoneEncrypted: encrypt(normalized.e164),
        phoneHash,
        phoneLastFour: lastFour(normalized.e164),
        countryCode: normalized.region,
        verificationSource: "merchant_submitted",
        verificationReference,
        enabled: false,
      },
      update: { carrierName, verificationReference },
    });
    return { carrierSubmitted: true };
  }

  const selectedRegions = formData.getAll("enabledRegion").map(String);
  const approvedPolicies = await prisma.regionPolicy.findMany({
    where: {
      countryCode: { in: selectedRegions },
      enabled: true,
      disabledAt: null,
      legalApprovedAt: { not: null },
      productionApprovedAt: { not: null },
      effectiveAt: { lte: new Date() },
      calleLineId: { not: null },
      legalApprovalReference: { not: null },
      vendorApprovalReference: { not: null },
      localizationApprovedAt: { not: null },
      localizationApprovalReference: { not: null },
      NOT: { timezoneStrategy: "disabled" },
      callScriptVersion: CALL_SCRIPT_VERSION,
    },
    select: { countryCode: true, timezoneStrategy: true },
  });
  const approvedRegions = approvedPolicies
    .filter((policy) => resolveRegionPolicyTimeZone(policy.timezoneStrategy))
    .map((policy) => policy.countryCode);
  const termsAccepted = formData.get("termsAccepted") === "yes";
  const wantsCallingEnabled = formData.get("globalCallingEnabled") === "yes";
  if (wantsCallingEnabled) {
    if (
      !termsAccepted ||
      approvedRegions.length === 0 ||
      !(await hasActiveEntitlement(settings.id))
    ) {
      return {
        error:
          "Approve pricing, accept the current legal terms, and select an approved region before enabling calls.",
      };
    }
  }
  const maxCalls = Math.min(
    2,
    Math.max(1, Number(formData.get("maxCallsPerCustomerPerDay")) || 2),
  );
  const maxConcurrent = Math.min(
    20,
    Math.max(1, Number(formData.get("maxConcurrentCalls")) || 5),
  );
  const confidence = Math.min(
    0.99,
    Math.max(0.85, Number(formData.get("confidenceThreshold")) || 0.85),
  );
  const locale = String(formData.get("defaultLocale") ?? "en").split("-")[0];
  await prisma.shopSettings.update({
    where: { id: settings.id },
    data: {
      storeName:
        String(formData.get("storeName") ?? settings.storeName).trim() ||
        settings.storeName,
      businessIdentity:
        String(formData.get("businessIdentity") ?? "").trim() || null,
      supportDepartmentName: String(
        formData.get("supportDepartmentName") ?? settings.supportDepartmentName,
      ).trim(),
      agentName: String(formData.get("agentName") ?? settings.agentName).trim(),
      timezone: String(formData.get("timezone") ?? settings.timezone),
      defaultLocale: SUPPORTED_LOCALES.includes(
        locale as (typeof SUPPORTED_LOCALES)[number],
      )
        ? locale
        : "en",
      humanEscalationEmail:
        String(formData.get("humanEscalationEmail") ?? "").trim() || null,
      enabledRegionsJson: JSON.stringify(approvedRegions),
      globalCallingEnabled: wantsCallingEnabled,
      termsAcceptedAt: termsAccepted
        ? (settings.termsAcceptedAt ?? new Date())
        : null,
      termsVersion: termsAccepted ? legalVersion : null,
      confidenceThreshold: confidence,
      maxCallsPerCustomerPerDay: maxCalls,
      maxConcurrentCalls: maxConcurrent,
    },
  });
  return { saved: true };
};

export default function Settings() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const usagePercent = Math.min(
    100,
    Math.round(
      (data.billing.completedCalls / Math.max(1, data.billing.includedLimit)) *
        100,
    ),
  );
  return (
    <s-page heading="Setup and settings">
      {!data.setupComplete && (
        <s-banner tone="warning">
          <s-text>
            Setup is incomplete. Calling stays off until pricing, legal terms,
            and at least one approved region are ready.
          </s-text>
        </s-banner>
      )}
      {fetcher.data?.error && (
        <s-banner tone="critical">
          <s-text>{fetcher.data.error}</s-text>
        </s-banner>
      )}
      {fetcher.data?.saved && (
        <s-banner tone="success">
          <s-text>Settings saved.</s-text>
        </s-banner>
      )}
      {fetcher.data?.stopped && (
        <s-banner tone="success">
          <s-text>All calls stopped for this store.</s-text>
        </s-banner>
      )}

      <s-section heading="Pricing and usage">
        <s-stack direction="block" gap="base">
          <s-text>
            $29/month · 250 completed calls included · $0.10 per additional
            completed call · 14-day/25-call trial.
          </s-text>
          <s-text>
            Status: {data.billing.status} · {data.billing.completedCalls}/
            {data.billing.includedLimit} included calls ({usagePercent}%) ·
            estimated overage $
            {(data.billing.estimatedOverageMinor / 100).toFixed(2)} USD.
          </s-text>
          {data.billing.warnings.map((warning) => (
            <s-banner
              key={warning.scope}
              tone={warning.threshold >= 100 ? "critical" : "warning"}
            >
              <s-text>
                You have used {warning.percentage}% of your{" "}
                {warning.scope === "included"
                  ? "included completed-call allowance"
                  : "$200 overage ceiling"}
                . Threshold: {warning.threshold}%.
              </s-text>
            </s-banner>
          ))}
          {data.billing.hardLimitReached && (
            <s-banner tone="critical">
              <s-text>
                The 2,250-call monthly application ceiling is active. No calls
                can start.
              </s-text>
            </s-banner>
          )}
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="sync_subscription" />
            <s-button type="submit" disabled={busy}>
              Refresh subscription
            </s-button>
          </fetcher.Form>
        </s-stack>
      </s-section>

      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="save" />
        <s-section heading="Business identity">
          <s-stack direction="block" gap="base">
            <s-text-field
              label="Store name"
              name="storeName"
              value={data.settings.storeName}
              required
            />
            <s-text-field
              label="Calling business identity"
              name="businessIdentity"
              value={data.settings.businessIdentity ?? ""}
              details="This business name is disclosed at the start of every call."
              required
            />
            <s-text-field
              label="Support department"
              name="supportDepartmentName"
              value={data.settings.supportDepartmentName}
              required
            />
            <s-text-field
              label="AI assistant name"
              name="agentName"
              value={data.settings.agentName}
              required
            />
            <s-email-field
              label="Escalation email"
              name="humanEscalationEmail"
              value={data.settings.humanEscalationEmail ?? ""}
              autocomplete="email"
            />
          </s-stack>
        </s-section>

        <s-section heading="Locale and safeguards">
          <s-stack direction="block" gap="base">
            <s-text-field
              label="IANA timezone"
              name="timezone"
              value={data.settings.timezone}
              details="Used only when an approved recipient-specific timezone is unavailable."
              required
            />
            <s-select
              label="Default language"
              name="defaultLocale"
              value={data.settings.defaultLocale}
            >
              {SUPPORTED_LOCALES.map((locale) => (
                <s-option key={locale} value={locale}>
                  {locale}
                </s-option>
              ))}
            </s-select>
            <s-select
              label="Minimum result confidence"
              name="confidenceThreshold"
              value={String(data.settings.confidenceThreshold)}
            >
              <s-option value="0.95">95%</s-option>
              <s-option value="0.90">90%</s-option>
              <s-option value="0.85">85%</s-option>
            </s-select>
            <s-number-field
              label="Maximum customer attempts per day"
              name="maxCallsPerCustomerPerDay"
              min={1}
              max={2}
              value={String(data.settings.maxCallsPerCustomerPerDay)}
            />
            <s-number-field
              label="Maximum concurrent calls"
              name="maxConcurrentCalls"
              min={1}
              max={20}
              value={String(data.settings.maxConcurrentCalls)}
            />
          </s-stack>
        </s-section>

        <s-section heading="Approved regions">
          <s-text>
            Regions are disabled until legal review, CALL-E production
            authorization, caller ID/KYC, and localized scripts are recorded by
            operations.
          </s-text>
          <s-grid
            gridTemplateColumns="repeat(auto-fit, minmax(240px, 1fr))"
            gap="base"
          >
            {data.regions.map((region) => (
              <s-checkbox
                key={region.countryCode}
                name="enabledRegion"
                value={region.countryCode}
                label={`${region.countryName} (${region.countryCode}) — ${region.approved ? "approved" : "blocked"}`}
                disabled={!region.approved}
                defaultChecked={
                  region.approved &&
                  data.settings.enabledRegions.includes(region.countryCode)
                }
              />
            ))}
          </s-grid>
        </s-section>

        <s-section heading="Legal acceptance and call switch">
          <s-stack direction="block" gap="base">
            <s-text>
              Review the{" "}
              <s-link href="/terms" target="_blank">
                Terms
              </s-link>
              ,{" "}
              <s-link href="/privacy" target="_blank">
                Privacy Policy
              </s-link>
              ,{" "}
              <s-link href="/dpa" target="_blank">
                DPA
              </s-link>
              , and{" "}
              <s-link href="/acceptable-use" target="_blank">
                Calling Policy
              </s-link>
              .
            </s-text>
            <s-checkbox
              name="termsAccepted"
              value="yes"
              label="I accept the current legal documents for this store"
              defaultChecked={data.settings.termsAccepted}
            />
            <s-checkbox
              name="globalCallingEnabled"
              value="yes"
              label="Enable calls for this store after all gates pass"
              defaultChecked={data.settings.globalCallingEnabled}
            />
            <s-button type="submit" variant="primary" disabled={busy}>
              Save setup
            </s-button>
          </s-stack>
        </s-section>
      </fetcher.Form>

      <s-section heading="Emergency controls">
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="global_stop" />
          <s-button type="submit" tone="critical" disabled={busy}>
            Stop all calls now
          </s-button>
        </fetcher.Form>
        <s-text>
          Runtime: {data.runtime.providerMode} · CALL-E credential{" "}
          {data.runtime.calleConfigured ? "configured" : "missing"} · live-call
          switch {data.runtime.realCallsEnabled ? "on" : "off"}.
        </s-text>
      </s-section>

      <s-section heading="Carrier support numbers">
        <s-text>
          Submitted numbers remain disabled until CallMeMaybe verifies the
          official carrier source and supported production caller route.
        </s-text>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="submit_carrier" />
          <s-stack direction="block" gap="base">
            <s-text-field name="carrierName" label="Carrier name" required />
            <s-text-field
              name="carrierPhone"
              label="Official support number (E.164)"
              required
            />
            <s-text-field
              name="verificationReference"
              label="Official source URL or case reference"
              required
            />
            <s-button type="submit" disabled={busy}>
              Submit for verification
            </s-button>
          </s-stack>
        </fetcher.Form>
        <s-unordered-list>
          {data.carrierEndpoints.map((endpoint) => (
            <s-list-item key={endpoint.id}>
              {endpoint.carrierName} · {endpoint.countryCode} · ending{" "}
              {endpoint.phoneLastFour} ·{" "}
              {endpoint.enabled && endpoint.verifiedAt
                ? "verified"
                : "pending verification"}
            </s-list-item>
          ))}
        </s-unordered-list>
      </s-section>

      <s-section heading="Consent and suppression">
        <s-text>
          {data.operational.activeConsents} active order consents ·{" "}
          {data.operational.suppressions} suppressed numbers.
        </s-text>
      </s-section>

      <s-section heading="Shop policies">
        <s-text>
          {data.knowledge.count} policy sources
          {data.knowledge.latest
            ? ` · last synced ${new Date(data.knowledge.latest).toLocaleString()}`
            : " · not synced"}
          .
        </s-text>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="sync_policies" />
          <s-button type="submit" disabled={busy}>
            Sync Shopify policies
          </s-button>
        </fetcher.Form>
      </s-section>

      <s-section heading="Privacy requests">
        <s-text>
          Authenticated compliance jobs are encrypted, deduplicated, and
          processed by the worker.
        </s-text>
        {data.privacyRequests.length === 0 ? (
          <s-text>No privacy requests received.</s-text>
        ) : (
          <s-unordered-list>
            {data.privacyRequests.map((privacyRequest) => (
              <s-list-item key={privacyRequest.id}>
                {privacyRequest.topic.replaceAll("_", " ").toLowerCase()} ·{" "}
                {privacyRequest.status.toLowerCase()}
                {privacyRequest.status === "READY_FOR_MERCHANT" ? (
                  <>
                    {" "}
                    ·{" "}
                    <s-link href={`/app/privacy/${privacyRequest.id}`}>
                      Download export
                    </s-link>
                  </>
                ) : null}
              </s-list-item>
            ))}
          </s-unordered-list>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
