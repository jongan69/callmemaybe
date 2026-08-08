import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { getProviderMode } from "../providers/index.server";
import { syncShopPolicies } from "../services/knowledge.server";
import { purgeExpiredPrivateData } from "../services/privacy.server";

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

  await purgeExpiredPrivateData(
    session.shop,
    settings.id,
    settings.transcriptRetentionDays,
  );

  return {
    settings: {
      id: settings.id,
      storeName: settings.storeName,
      supportDepartmentName: settings.supportDepartmentName,
      agentName: settings.agentName,
      timezone: settings.timezone,
      defaultLocale: settings.defaultLocale,
      humanEscalationEmail: settings.humanEscalationEmail,
      callProviderMode: settings.callProviderMode,
      confidenceThreshold: settings.confidenceThreshold,
      maxCallsPerCustomerPerDay: settings.maxCallsPerCustomerPerDay,
      transcriptRetentionDays: settings.transcriptRetentionDays,
    },
    runtime: {
      providerMode: getProviderMode(),
      calleConfigured: Boolean(process.env.CALLE_API_KEY),
      realCallsEnabled: process.env.CALLE_REAL_CALLS_ENABLED === "true",
    },
    knowledge: {
      count: await prisma.knowledgeSource.count({
        where: { shopId: settings.id, status: "active" },
      }),
      latest: (await prisma.knowledgeSource.findFirst({
        where: { shopId: settings.id, status: "active" },
        orderBy: { syncedAt: "desc" },
        select: { syncedAt: true },
      }))?.syncedAt.toISOString() ?? null,
    },
    privacyRequests: await prisma.privacyRequest.findMany({
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
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "save");
  const settings = await prisma.shopSettings.findUnique({
    where: { shopDomain: session.shop },
  });

  if (intent === "sync_policies") {
    if (!settings) return { synced: 0, error: "Save store settings first." };
    const result = await syncShopPolicies(admin, settings.id);
    return {
      synced: result.synced,
      error: result.errors.length > 0 ? result.errors.join("; ") : null,
    };
  }

  const updates: Record<string, unknown> = {};
  const fields = ["storeName", "supportDepartmentName", "agentName", "timezone", "defaultLocale", "humanEscalationEmail"];
  for (const field of fields) {
    const v = formData.get(field);
    if (v) updates[field] = v;
  }
  const confStr = Number(formData.get("confidenceThreshold"));
  if (Number.isFinite(confStr)) {
    updates.confidenceThreshold = Math.min(0.99, Math.max(0.5, confStr));
  }
  const maxCalls = Number(formData.get("maxCallsPerCustomerPerDay"));
  if (Number.isInteger(maxCalls)) {
    updates.maxCallsPerCustomerPerDay = Math.min(10, Math.max(1, maxCalls));
  }
  const retentionDays = Number(formData.get("transcriptRetentionDays"));
  if (Number.isInteger(retentionDays)) {
    updates.transcriptRetentionDays = Math.min(365, Math.max(1, retentionDays));
  }
  await prisma.shopSettings.upsert({
    where: { shopDomain: session.shop },
    create: { shopDomain: session.shop, shopifyShopId: session.id, ...updates },
    update: updates,
  });

  return { saved: true };
};

export default function Settings() {
  const { settings, runtime, knowledge, privacyRequests } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  return (
    <s-page heading="Settings">
      <fetcher.Form method="POST">
        <input type="hidden" name="intent" value="save" />
        <s-section heading="Store identity">
          <p>
            <label>Store name<br /><input name="storeName" defaultValue={settings.storeName} /></label>
          </p>
          <p>
            <label>Support department name<br /><input name="supportDepartmentName" defaultValue={settings.supportDepartmentName} /></label>
          </p>
          <p>
            <label>AI agent display name<br /><input name="agentName" defaultValue={settings.agentName} /></label>
          </p>
        </s-section>

        <s-section heading="Locale and time">
          <p>
            <label>Business timezone<br />
              <select name="timezone" defaultValue={settings.timezone}>
                <option value="America/New_York">Eastern (US)</option>
                <option value="America/Chicago">Central (US)</option>
                <option value="America/Denver">Mountain (US)</option>
                <option value="America/Los_Angeles">Pacific (US)</option>
                <option value="Europe/London">London</option>
              </select>
            </label>
          </p>
          <p>
            <label>Default language<br />
              <select name="defaultLocale" defaultValue={settings.defaultLocale}>
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
              </select>
            </label>
          </p>
        </s-section>

        <s-section heading="Escalation">
          <p>
            <label>Human escalation email<br /><input name="humanEscalationEmail" type="email" defaultValue={settings.humanEscalationEmail ?? ""} /></label>
          </p>
        </s-section>

        <s-section heading="Safety thresholds">
          <p>
            <label>Confidence threshold<br />
              <select name="confidenceThreshold" defaultValue={String(settings.confidenceThreshold)}>
                <option value="0.95">95% - Very high</option>
                <option value="0.85">85% - High</option>
                <option value="0.70">70% - Medium</option>
                <option value="0.50">50% - Low</option>
              </select>
            </label>
          </p>
          <p>
            <label>Max calls per customer per day<br /><input name="maxCallsPerCustomerPerDay" type="number" min="1" max="10" defaultValue={String(settings.maxCallsPerCustomerPerDay)} /></label>
          </p>
          <p>
            <label>Transcript retention (days)<br /><input name="transcriptRetentionDays" type="number" min="1" max="365" defaultValue={String(settings.transcriptRetentionDays)} /></label>
          </p>
        </s-section>

        <s-stack direction="inline" gap="base">
          <button type="submit">Save settings</button>
          {fetcher.data?.saved && <s-badge tone="success">Saved</s-badge>}
        </s-stack>
      </fetcher.Form>

      <s-section heading="CALL-E runtime">
        <s-stack direction="block" gap="base">
          <s-banner tone={runtime.providerMode === "calle" ? "success" : "info"}>
            <s-text>
              {runtime.providerMode === "calle"
                ? "Live CALL-E calls are enabled by the server environment."
                : "Fixture mode is active. No real phone calls can be placed."}
            </s-text>
          </s-banner>
          <s-text>
            API key: {runtime.calleConfigured ? "configured" : "not configured"} ·
            safety switch: {runtime.realCallsEnabled ? "enabled" : "disabled"}
          </s-text>
          <s-text>
            Provider mode is intentionally controlled by server environment variables,
            not by a browser form.
          </s-text>
        </s-stack>
      </s-section>

      <s-section heading="Store policy knowledge">
        <s-text>
          {knowledge.count} active {knowledge.count === 1 ? "policy" : "policies"}
          {knowledge.latest ? ` · last synced ${new Date(knowledge.latest).toLocaleString()}` : " · not synced yet"}
        </s-text>
        <fetcher.Form method="POST">
          <input type="hidden" name="intent" value="sync_policies" />
          <button type="submit">Sync Shopify policies</button>
        </fetcher.Form>
        {fetcher.data?.synced !== undefined && !fetcher.data.error && (
          <s-badge tone="success">Synced {fetcher.data.synced} updated policies</s-badge>
        )}
        {fetcher.data?.error && <s-banner tone="critical"><s-text>{fetcher.data.error}</s-text></s-banner>}
      </s-section>

      <s-section heading="Privacy requests">
        <s-text>
          Shopify compliance requests are authenticated, tracked, and automatically
          redacted. Customer data exports are encrypted at rest and expire after 30 days.
        </s-text>
        {privacyRequests.length === 0 ? (
          <s-text>No privacy requests received.</s-text>
        ) : (
          <ul>
            {privacyRequests.map((privacyRequest) => (
              <li key={privacyRequest.id}>
                {privacyRequest.topic.replaceAll("_", " ").toLowerCase()} · {privacyRequest.status.replaceAll("_", " ").toLowerCase()} · {new Date(privacyRequest.receivedAt).toLocaleString()}
                {privacyRequest.status === "READY_FOR_MERCHANT" && privacyRequest.expiresAt && new Date(privacyRequest.expiresAt) > new Date() ? (
                  <> · <a href={`/app/privacy/${privacyRequest.id}`}>Download JSON export</a></>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
