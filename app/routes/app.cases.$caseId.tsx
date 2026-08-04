import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getSupportCase } from "../services/support-case.server";
import { getAuditTrail } from "../services/audit.server";
import { executeResolution } from "../services/resolution.server";
import prisma from "../db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const caseId = params.caseId as string;

  const caseData = await getSupportCase(caseId);
  if (!caseData) throw new Response("Case not found", { status: 404 });

  const auditTrail = await getAuditTrail(caseData.id);

  return {
    case: {
      id: caseData.publicReference,
      status: caseData.status as string,
      issueType: caseData.issueType,
      orderId: caseData.shopifyOrderId,
      orderName: caseData.shopifyOrderName,
      customerId: caseData.shopifyCustomerId,
      phoneLastFour: caseData.customerPhoneLastFour as string,
      resolutionMode: caseData.resolutionMode,
      riskLevel: caseData.riskLevel,
      orderSnapshot: caseData.orderSnapshotJson ? JSON.parse(caseData.orderSnapshotJson) : null,
      requestedAt: caseData.requestedAt?.toISOString() ?? null,
      resolvedAt: caseData.resolvedAt?.toISOString() ?? null,
      createdAt: caseData.createdAt.toISOString(),
      latestCallAttempt: caseData.latestCallAttempt ? {
        id: caseData.latestCallAttempt.id,
        status: caseData.latestCallAttempt.status,
        outcome: caseData.latestCallAttempt.outcome,
        taskCompleted: caseData.latestCallAttempt.taskCompleted,
        confidence: caseData.latestCallAttempt.completionConfidenceScore,
        confidenceLabel: caseData.latestCallAttempt.completionConfidenceLabel,
        summary: caseData.latestCallAttempt.summary,
        transcriptRedacted: caseData.latestCallAttempt.transcriptRedacted,
        structuredResult: caseData.latestCallAttempt.structuredResultJson ? JSON.parse(caseData.latestCallAttempt.structuredResultJson) : null,
        events: caseData.latestCallAttempt.callEvents.map((e) => ({ type: e.eventType, time: e.eventTime.toISOString(), sequence: e.sequence })),
        startedAt: caseData.latestCallAttempt.startedAt?.toISOString() ?? null,
        completedAt: caseData.latestCallAttempt.completedAt?.toISOString() ?? null,
      } : null,
      latestProposal: caseData.latestProposal ? {
        id: caseData.latestProposal.id,
        actionType: caseData.latestProposal.actionType,
        status: caseData.latestProposal.status,
        riskLevel: caseData.latestProposal.riskLevel,
        requiresApproval: caseData.latestProposal.requiresApproval,
        policyDecision: caseData.latestProposal.policyDecisionJson ? JSON.parse(caseData.latestProposal.policyDecisionJson) : null,
        beforeState: caseData.latestProposal.beforeStateJson ? JSON.parse(caseData.latestProposal.beforeStateJson) : null,
      } : null,
    },
    auditTrail,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const caseId = params.caseId as string;

  const supportCase = await prisma.supportCase.findUnique({ where: { publicReference: caseId } });
  if (!supportCase) throw new Response("Case not found", { status: 404 });

  if (intent === "approve") {
    const proposalId = formData.get("proposalId") as string;

    await prisma.resolutionProposal.update({
      where: { id: proposalId },
      data: { status: "APPROVED", approvedBy: session.id, approvedAt: new Date() },
    });

    // Approval is not the end state. It authorises execution, which re-reads the
    // order and applies the change to Shopify. The case only becomes RESOLVED if
    // that succeeds.
    await prisma.supportCase.update({
      where: { id: supportCase.id },
      data: { status: "EXECUTING_RESOLUTION" },
    });

    const outcome = await executeResolution({
      admin,
      proposalId,
      shopId: supportCase.shopId,
      actorId: session.id,
    });

    switch (outcome.status) {
      case "EXECUTED":
        return { approved: true, executed: true };
      case "STALE":
        return {
          approved: true,
          executed: false,
          error: `The order changed since the call, so nothing was applied: ${outcome.reasons.join("; ")}`,
        };
      case "FAILED":
        return { approved: true, executed: false, error: outcome.reason };
      case "SKIPPED":
        return { approved: true, executed: false, note: outcome.reason };
    }
  }
  if (intent === "reject") {
    const proposalId = formData.get("proposalId") as string;
    const reason = formData.get("reason") as string;
    await prisma.resolutionProposal.update({
      where: { id: proposalId },
      data: { status: "REJECTED", rejectedBy: session.id, rejectedAt: new Date(), rejectionReason: reason || "Rejected" },
    });
    await prisma.supportCase.update({ where: { id: supportCase.id }, data: { status: "NEEDS_HUMAN" } });
    return { rejected: true };
  }
  if (intent === "escalate") {
    await prisma.supportCase.update({ where: { id: supportCase.id }, data: { status: "NEEDS_HUMAN" } });
    return { escalated: true };
  }
  return null;
};

export default function CaseDetail() {
  const { case: caseData, auditTrail } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const statTone = (s: string) => ({ RESOLVED: "success", AWAITING_APPROVAL: "caution", NEEDS_HUMAN: "critical", FAILED: "critical", CALLING: "info", PROCESSING_RESULT: "info", CANCELED: "neutral" }[s] ?? "info") as "success" | "caution" | "critical" | "info" | "neutral";

  return (
    <s-page heading={`Case ${caseData.id}`}>
      <s-section heading="Case details">
        <s-stack direction="inline" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Status</s-heading>
            <s-badge tone={statTone(caseData.status)}>{caseData.status.replace(/_/g, " ")}</s-badge>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Issue type</s-heading>
            <s-text>{caseData.issueType.replace(/_/g, " ")}</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Order</s-heading>
            <s-text>{caseData.orderName}</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Phone</s-heading>
            <s-text>***-***-{caseData.phoneLastFour}</s-text>
          </s-box>
          {caseData.riskLevel && (
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-heading>Risk level</s-heading>
              <s-badge tone={caseData.riskLevel === "HIGH" || caseData.riskLevel === "CRITICAL" ? "critical" : "info"}>{caseData.riskLevel}</s-badge>
            </s-box>
          )}
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Created</s-heading>
            <s-text>{new Date(caseData.createdAt).toLocaleString()}</s-text>
          </s-box>
        </s-stack>
      </s-section>

      {caseData.latestCallAttempt && (
        <s-section heading="Call timeline">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            {caseData.latestCallAttempt.events.map((event: { type: string; time: string; sequence: number }, i: number) => (
              <s-stack key={i} direction="inline" gap="base">
                <s-badge tone="info">{event.type}</s-badge>
                <s-text>{new Date(event.time).toLocaleTimeString()}</s-text>
              </s-stack>
            ))}
          </s-box>
        </s-section>
      )}

      {caseData.latestCallAttempt?.structuredResult && (
        <s-section heading="Call result">
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-text>Disposition: {caseData.latestCallAttempt.structuredResult.disposition as string}</s-text>
            <s-text>Identity: {caseData.latestCallAttempt.structuredResult.identity_status as string}</s-text>
            <s-text>Confidence: {Math.round((caseData.latestCallAttempt.confidence ?? 0) * 100)}%</s-text>
            {caseData.latestCallAttempt.structuredResult.summary && (
              <s-text>Summary: {caseData.latestCallAttempt.structuredResult.summary as string}</s-text>
            )}
          </s-box>
        </s-section>
      )}

      {caseData.latestCallAttempt?.transcriptRedacted && (
        <s-section heading="Transcript">
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <pre>{caseData.latestCallAttempt.transcriptRedacted}</pre>
          </s-box>
        </s-section>
      )}

      {caseData.latestProposal && (
        <s-section heading="Resolution proposal">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text>Action: {caseData.latestProposal.actionType.replace(/_/g, " ")}</s-text>
            <s-text>Status: {caseData.latestProposal.status}</s-text>
            {caseData.latestProposal.policyDecision && (
              (caseData.latestProposal.policyDecision.humanReadableReasons as string[]).map((r: string, i: number) => (
                <s-text key={i} tone={r.includes("pass") ? "success" : "critical"}>{r}</s-text>
              ))
            )}
            {caseData.latestProposal.requiresApproval && caseData.latestProposal.status === "PENDING" && (
              <s-stack direction="inline" gap="base">
                <fetcher.Form method="POST">
                  <input type="hidden" name="intent" value="approve" />
                  <input type="hidden" name="proposalId" value={caseData.latestProposal.id} />
                  <button type="submit">Approve</button>
                </fetcher.Form>
                <fetcher.Form method="POST">
                  <input type="hidden" name="intent" value="reject" />
                  <input type="hidden" name="proposalId" value={caseData.latestProposal.id} />
                  <input type="hidden" name="reason" value="Rejected after merchant review" />
                  <button type="submit">Reject</button>
                </fetcher.Form>
                <fetcher.Form method="POST">
                  <input type="hidden" name="intent" value="escalate" />
                  <button type="submit">Escalate</button>
                </fetcher.Form>
              </s-stack>
            )}
          </s-box>
        </s-section>
      )}

      <s-section heading="Audit trail">
        {auditTrail.length === 0 ? (
          <s-text>No audit events recorded.</s-text>
        ) : (
          <s-table>
            <thead>
              <tr>
                <th>Actor</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Request ID</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {(auditTrail as Array<Record<string, unknown>>).map((event, i) => (
                <tr key={i}>
                  <td><s-badge>{event.actorType as string}</s-badge></td>
                  <td>{event.action as string}</td>
                  <td>{event.resourceType as string}</td>
                  <td><s-text>{(event.requestId as string)?.slice(0, 8)}...</s-text></td>
                  <td>{new Date(event.createdAt as string).toLocaleString()}</td>
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
