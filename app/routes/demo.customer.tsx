import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import {
  createSupportCase,
  buildCallPlan,
} from "../services/support-case.server";
import type { OrderSnapshot } from "../lib/types";
import { sha256Hash } from "../lib/crypto.server";
import { grantCallConsent, normalizePhone } from "../services/consent.server";
import { enqueueJob, JOBS } from "../queue.server";

const snapshot: OrderSnapshot = {
  orderId: "gid://shopify/Order/demo-1043",
  updatedAt: new Date().toISOString(),
  financialStatus: "paid",
  fulfillmentStatus: "UNFULFILLED",
  cancelledAt: null,
  shippingAddressHash: sha256Hash("118 Cedar Street, Portland OR 97214"),
  fulfillmentHash: sha256Hash("unfulfilled"),
  lineItemHash: sha256Hash("line-1"),
  totalMinor: 12400,
  currencyCode: "USD",
  capturedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
};

const DEMO_SHOP_DOMAIN =
  process.env.DEMO_SHOP_DOMAIN || "callmemaybe-demo.myshopify.com";

function html(page: string) {
  return new Response(page, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character] ?? character,
  );
}

const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f6f6f7;color:#202223;line-height:1.5}
.container{max-width:640px;margin:40px auto;padding:0 16px}
.card{background:white;border-radius:8px;padding:24px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.card h2{font-size:16px;font-weight:600;margin-bottom:12px;color:#6d7175;text-transform:uppercase;letter-spacing:.5px}
.card h1{font-size:24px;font-weight:700;margin-bottom:4px}
.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f1f1}
.row:last-child{border-bottom:none}
.badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:13px;font-weight:500}
.badge-amber{background:#fff3e0;color:#b45309}
.badge-green{background:#e8f5e9;color:#2e7d32}
.badge-red{background:#ffebee;color:#c62828}
.btn{display:block;width:100%;padding:16px;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;transition:all .15s}
.btn-primary{background:#1a1a2e;color:white}
.btn-primary:hover{background:#16213e}
.btn:disabled{opacity:.5;cursor:not-allowed}
input:not([type=checkbox]),select{width:100%;padding:12px;border:1px solid #c9cccf;border-radius:6px;font-size:15px;margin-bottom:10px}
.consent{display:flex;align-items:flex-start;gap:9px;color:#6d7175;font-size:12px;margin:4px 0 14px}
.consent input{margin-top:3px}
.result{padding:16px;border-radius:8px;margin-top:12px}
.result-success{background:#e8f5e9;border:1px solid #a5d6a7}
.result-error{background:#ffebee;border:1px solid #ef9a9a}
.code{font-size:32px;font-weight:700;letter-spacing:4px;text-align:center;padding:12px;background:#f5f5f5;border-radius:6px;margin:8px 0}
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const demoToken = url.searchParams.get("token") ?? "";
  if (
    process.env.DEMO_MODE_ENABLED !== "true" ||
    !process.env.DEMO_ACCESS_TOKEN ||
    demoToken !== process.env.DEMO_ACCESS_TOKEN
  ) {
    throw new Response("Not found", { status: 404 });
  }

  const settings = await prisma.shopSettings.findFirst({
    where: { shopDomain: DEMO_SHOP_DOMAIN },
  });
  const storeName = escapeHtml(settings?.storeName ?? "Northstar Supply Co.");
  const safeDemoToken = escapeHtml(demoToken);

  const existing = await prisma.supportCase.findFirst({
    where: {
      shopifyOrderId: snapshot.orderId,
      status: { notIn: ["RESOLVED", "CANCELED"] },
    },
    orderBy: { createdAt: "desc" },
  });

  const status = url.searchParams.get("status");
  const caseRef = url.searchParams.get("case");
  const verificationCode = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  let statusBlock = "";
  if (status === "ok" && caseRef && verificationCode) {
    statusBlock = `<div class="result result-success"><strong>Call on the way!</strong><br><p style="font-size:14px;margin-top:4px">Your phone will ring shortly. Case: <strong>${escapeHtml(caseRef)}</strong></p><p style="font-size:13px;color:#6d7175;margin-top:8px">When the agent calls, give it this one-time support code:</p><div class="code">${escapeHtml(verificationCode)}</div><p style="font-size:12px;color:#6d7175">The agent allows two attempts and will never read the code to you.</p></div>`;
  } else if (existing) {
    statusBlock = `<div class="result result-success"><strong>Your case is open</strong><br>Reference: <strong>${existing.publicReference}</strong><br>Status: ${existing.status.replace(/_/g, " ")}</div>`;
  } else if (error) {
    statusBlock = `<div class="result result-error">${escapeHtml(error)}</div>`;
  }

  const form =
    statusBlock || existing
      ? ""
      : `<form method="post"><input name="demoToken" type="hidden" value="${safeDemoToken}"><input name="phone" type="tel" placeholder="Authorized demo number in E.164 format" required><label class="consent"><input name="consent" type="checkbox" value="yes" required><span>I ask ${storeName} to call me with an AI support assistant about this order. This consent allows up to two attempts within seven days, at least 24 hours apart. The call is processed by an AI service and may be transcribed temporarily to provide support. I can revoke consent at any time.</span></label><button type="submit" class="btn btn-primary">Get phone support</button></form>`;

  return html(`<!DOCTYPE html>
<html><head><title>Order #1043 — ${storeName}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style></head>
<body><div class="container">
<div class="card"><p style="color:#6d7175;font-size:14px">${storeName}</p><h1>Order #1043</h1><p style="color:#6d7175">Placed July 28, 2026 · $124.00</p></div>
<div class="card"><h2>Items</h2><div class="row"><span>TrailBlazer Pro 4-Person Tent × 1</span><span style="font-weight:600">$124.00</span></div></div>
<div class="card"><h2>Shipping</h2><p>Alex Johnson, 118 Cedar Street, Portland OR 97214</p><p style="color:#6d7175;font-size:14px;margin-top:4px">Northline Freight · Tracking NL4820199317</p><span class="badge badge-amber" style="margin-top:8px">Carrier reports delivered July 28, 2026</span></div>
<div class="card"><h2>Problem with this order?</h2><p style="color:#6d7175;margin-bottom:12px">The carrier says delivered but you didn't get it? An AI assistant can call you back in under a minute — no hold music, no waiting.</p>${statusBlock}${form}</div>
</div></body></html>`);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (
    process.env.DEMO_MODE_ENABLED !== "true" ||
    !process.env.DEMO_ACCESS_TOKEN
  ) {
    throw new Response("Not found", { status: 404 });
  }

  const formData = await request.formData();
  const demoToken = String(formData.get("demoToken") ?? "");
  if (demoToken !== process.env.DEMO_ACCESS_TOKEN) {
    throw new Response("Not found", { status: 404 });
  }

  const settings = await prisma.shopSettings.findFirst({
    where: { shopDomain: DEMO_SHOP_DOMAIN },
  });
  if (!settings) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: `/demo/customer?token=${encodeURIComponent(demoToken)}&error=Store+not+configured`,
      },
    });
  }

  const phone = String(formData.get("phone") ?? "").trim();
  const consented = formData.get("consent") === "yes";

  if (!consented) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: `/demo/customer?token=${encodeURIComponent(demoToken)}&error=Consent+is+required`,
      },
    });
  }
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: `/demo/customer?token=${encodeURIComponent(demoToken)}&error=Enter+your+phone+number+in+international+format`,
      },
    });
  }

  try {
    const consent = await grantCallConsent({
      shopId: settings.id,
      shopifyOrderId: snapshot.orderId,
      shopifyCustomerId: "gid://shopify/Customer/demo-5501",
      phone: normalized.e164,
      purpose: "ORDER_SUPPORT",
      source: "reviewer_demo",
      locale: settings.defaultLocale,
      storeName: settings.storeName,
      userAgentSummary: "reviewer-demo",
    });
    const supportCase = await createSupportCase({
      shopId: settings.id,
      shopDomain: settings.shopDomain,
      shopifyOrderId: snapshot.orderId,
      shopifyOrderName: "#1043",
      shopifyCustomerId: "gid://shopify/Customer/demo-5501",
      issueType: "ORDER_STATUS",
      customerPhone: normalized.e164,
      customerName: "Alex Johnson",
      orderSnapshot: snapshot,
      consentId: consent.id,
    });

    await buildCallPlan({
      supportCaseId: supportCase.caseId,
      shopId: settings.id,
      storeName: settings.storeName,
      agentName: settings.agentName,
      issueType: "ORDER_STATUS",
      customerPhone: normalized.e164,
      region: normalized.region,
      locale: settings.defaultLocale,
      verificationCode: supportCase.verificationCode,
      orderSnapshot: snapshot,
      orderName: "#1043",
      stuckOrder: {
        blockerDescription: "Package marked delivered but never received.",
        emailAttempts: 2,
      },
    });

    // Submit the call
    const callPlan = await prisma.callPlan.findFirst({
      where: { supportCaseId: supportCase.caseId },
    });
    if (callPlan) {
      await enqueueJob(
        JOBS.CALL_PLACEMENT,
        {
          supportCaseId: supportCase.caseId,
          callPlanId: callPlan.id,
          shopId: settings.id,
        },
        `call-plan:${callPlan.id}`,
      );
      await prisma.supportCase.update({
        where: { id: supportCase.caseId },
        data: { status: "CALL_SUBMITTED" },
      });
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: `/demo/customer?token=${encodeURIComponent(demoToken)}&status=ok&case=${supportCase.publicReference}&code=${supportCase.verificationCode}`,
      },
    });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Could not create case";
    return new Response(null, {
      status: 302,
      headers: {
        Location: `/demo/customer?token=${encodeURIComponent(demoToken)}&error=${encodeURIComponent(msg)}`,
      },
    });
  }
};
