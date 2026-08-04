import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

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
      realCallsEnabled: settings.realCallsEnabled,
      confidenceThreshold: settings.confidenceThreshold,
      maxCallsPerCustomerPerDay: settings.maxCallsPerCustomerPerDay,
      transcriptRetentionDays: settings.transcriptRetentionDays,
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const updates: Record<string, unknown> = {};
  const fields = ["storeName", "supportDepartmentName", "agentName", "timezone", "defaultLocale", "humanEscalationEmail", "callProviderMode"];
  for (const field of fields) {
    const v = formData.get(field);
    if (v) updates[field] = v;
  }
  const confStr = formData.get("confidenceThreshold");
  if (confStr) updates.confidenceThreshold = parseFloat(confStr as string);
  const maxStr = formData.get("maxCallsPerCustomerPerDay");
  if (maxStr) updates.maxCallsPerCustomerPerDay = parseInt(maxStr as string, 10);
  const retStr = formData.get("transcriptRetentionDays");
  if (retStr) updates.transcriptRetentionDays = parseInt(retStr as string, 10);
  updates.realCallsEnabled = formData.get("realCallsEnabled") === "true";

  await prisma.shopSettings.upsert({
    where: { shopDomain: session.shop },
    create: { shopDomain: session.shop, shopifyShopId: session.id, ...updates },
    update: updates,
  });

  return { saved: true };
};

export default function Settings() {
  const { settings } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  return (
    <s-page heading="Settings">
      <fetcher.Form method="POST">
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

        <s-section heading="Calling configuration">
          <p>
            <label>Call provider mode<br />
              <select name="callProviderMode" defaultValue={settings.callProviderMode}>
                <option value="fake">Fake (testing)</option>
                <option value="calle">CALL-E (live)</option>
              </select>
            </label>
          </p>
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
            <label>Max calls per customer per day<br /><input name="maxCallsPerCustomerPerDay" type="number" defaultValue={String(settings.maxCallsPerCustomerPerDay)} /></label>
          </p>
          <p>
            <label>Transcript retention (days)<br /><input name="transcriptRetentionDays" type="number" defaultValue={String(settings.transcriptRetentionDays)} /></label>
          </p>
        </s-section>

        <s-stack direction="inline" gap="base">
          <button type="submit">Save settings</button>
          {fetcher.data?.saved && <s-badge tone="success">Saved</s-badge>}
        </s-stack>
      </fetcher.Form>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
