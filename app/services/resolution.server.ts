import prisma from "../db.server";
import type { OrderSnapshot, ResolutionActionType, ActionReceipt } from "../lib/types";
import {
  type AdminClient,
  fetchOrderContext,
  buildOrderSnapshot,
  compareOrderSnapshots,
  updateShippingAddress,
  cancelOrder,
  addOrderNote,
} from "./shopify-adapter.server";
import { createAuditEvent } from "./audit.server";
import { sha256Hash } from "../lib/crypto.server";
import { ErrorCodes, createError } from "../lib/errors.server";

// Execution is the last mile: an approved proposal becomes an actual change to
// an actual Shopify order, or it does not happen at all.
//
// The rule that matters here is the drift check. A proposal is built from a
// snapshot taken when the call started. By the time a merchant approves it,
// minutes or hours later, the order may have shipped, been cancelled, or been
// edited by a human. Executing against a stale snapshot is how an automation
// ships a package to an address the customer already corrected, or cancels an
// order that already went out. So we re-read the order immediately before
// mutating and refuse if anything consequential moved.

export type ExecutionOutcome =
  | { status: "EXECUTED"; receipt: ActionReceipt }
  | { status: "STALE"; reasons: string[] }
  | { status: "FAILED"; reason: string; receipt?: ActionReceipt }
  | { status: "SKIPPED"; reason: string };

// Actions that only write to our own records need no Shopify mutation.
const NON_MUTATING: ResolutionActionType[] = [
  "NONE",
  "EXPLAIN_STATUS",
  "ESCALATE",
  "SEND_UPLOAD_LINK",
];

export async function executeResolution(params: {
  admin: AdminClient;
  proposalId: string;
  shopId: string;
  actorId: string;
}): Promise<ExecutionOutcome> {
  const proposal = await prisma.resolutionProposal.findUnique({
    where: { id: params.proposalId },
    include: { supportCase: true },
  });

  if (!proposal) {
    throw createError(
      ErrorCodes.CASE_NOT_FOUND,
      `Resolution proposal ${params.proposalId} not found`,
      "That resolution no longer exists.",
    );
  }

  if (proposal.status !== "APPROVED") {
    return {
      status: "SKIPPED",
      reason: `Proposal is ${proposal.status}, not APPROVED`,
    };
  }

  const actionType = proposal.actionType as ResolutionActionType;

  // Idempotency: one execution row per proposal. If a previous attempt already
  // completed, do not mutate the order a second time.
  const existing = await prisma.resolutionExecution.findFirst({
    where: { resolutionProposalId: proposal.id, status: "COMPLETED" },
  });
  if (existing) {
    return {
      status: "SKIPPED",
      reason: "This resolution has already been executed.",
    };
  }

  if (NON_MUTATING.includes(actionType)) {
    await markCaseResolved(proposal.supportCaseId, params.shopId, params.actorId, actionType);
    return { status: "SKIPPED", reason: "No Shopify mutation required." };
  }

  const orderId = proposal.supportCase.shopifyOrderId;
  const proposedInput = JSON.parse(proposal.proposedInputJson ?? "{}") as Record<
    string,
    unknown
  >;
  const snapshotAtCallTime = JSON.parse(
    proposal.beforeStateJson ?? "null",
  ) as OrderSnapshot | null;

  const execution = await prisma.resolutionExecution.create({
    data: {
      resolutionProposalId: proposal.id,
      idempotencyKey: `exec_${proposal.id}_${Date.now()}`,
      status: "IN_PROGRESS",
      startedAt: new Date(),
      beforeStateJson: proposal.beforeStateJson,
      requestJson: JSON.stringify({ actionType, orderId, proposedInput }),
    },
  });

  try {
    // ── Drift check ──────────────────────────────────────────
    const liveOrder = await fetchOrderContext(params.admin, orderId);
    const liveSnapshot = buildOrderSnapshot(liveOrder);

    if (snapshotAtCallTime) {
      const drift = compareOrderSnapshots(snapshotAtCallTime, liveSnapshot);
      if (drift.changed) {
        await prisma.resolutionExecution.update({
          where: { id: execution.id },
          data: {
            status: "ABORTED_STALE",
            completedAt: new Date(),
            afterStateJson: JSON.stringify(liveSnapshot),
            userErrorsJson: JSON.stringify(drift.reasons),
          },
        });
        await prisma.resolutionProposal.update({
          where: { id: proposal.id },
          data: { status: "FAILED" },
        });
        await prisma.supportCase.update({
          where: { id: proposal.supportCaseId },
          data: { status: "NEEDS_HUMAN" },
        });

        await createAuditEvent({
          shopId: params.shopId,
          supportCaseId: proposal.supportCaseId,
          actorType: "system",
          action: "resolution.aborted_stale",
          resourceType: "resolution_proposal",
          resourceId: proposal.id,
          beforeHash: sha256Hash(JSON.stringify(snapshotAtCallTime)),
          afterHash: sha256Hash(JSON.stringify(liveSnapshot)),
          metadata: { reasons: drift.reasons, actionType },
        });

        return { status: "STALE", reasons: drift.reasons };
      }
    }

    // ── Mutate ───────────────────────────────────────────────
    const receipt = await runAction(params.admin, actionType, orderId, proposedInput);

    const afterOrder = await fetchOrderContext(params.admin, orderId);
    const afterSnapshot = buildOrderSnapshot(afterOrder);

    await prisma.resolutionExecution.update({
      where: { id: execution.id },
      data: {
        status: receipt.success ? "COMPLETED" : "FAILED",
        completedAt: new Date(),
        shopifyMutation: actionType,
        responseJson: JSON.stringify(receipt.after ?? null),
        userErrorsJson: JSON.stringify(receipt.userErrors),
        afterStateJson: JSON.stringify(afterSnapshot),
      },
    });

    if (!receipt.success) {
      await prisma.resolutionProposal.update({
        where: { id: proposal.id },
        data: { status: "FAILED" },
      });
      await prisma.supportCase.update({
        where: { id: proposal.supportCaseId },
        data: { status: "NEEDS_HUMAN" },
      });

      await createAuditEvent({
        shopId: params.shopId,
        supportCaseId: proposal.supportCaseId,
        actorType: "merchant",
        actorId: params.actorId,
        action: "resolution.failed",
        resourceType: "resolution_proposal",
        resourceId: proposal.id,
        metadata: { actionType, userErrors: receipt.userErrors },
      });

      return {
        status: "FAILED",
        reason:
          receipt.userErrors.map((e) => e.message).join("; ") ||
          "Shopify rejected the change.",
        receipt,
      };
    }

    await prisma.resolutionProposal.update({
      where: { id: proposal.id },
      data: { status: "COMPLETED" },
    });
    await prisma.supportCase.update({
      where: { id: proposal.supportCaseId },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });

    await createAuditEvent({
      shopId: params.shopId,
      supportCaseId: proposal.supportCaseId,
      actorType: "merchant",
      actorId: params.actorId,
      action: "resolution.executed",
      resourceType: "shopify_order",
      resourceId: orderId,
      beforeHash: sha256Hash(JSON.stringify(liveSnapshot)),
      afterHash: sha256Hash(JSON.stringify(afterSnapshot)),
      metadata: { actionType, idempotencyKey: receipt.idempotencyKey },
    });

    return { status: "EXECUTED", receipt };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await prisma.resolutionExecution.update({
      where: { id: execution.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        userErrorsJson: JSON.stringify([{ message }]),
      },
    });
    await prisma.supportCase.update({
      where: { id: proposal.supportCaseId },
      data: { status: "NEEDS_HUMAN" },
    });

    await createAuditEvent({
      shopId: params.shopId,
      supportCaseId: proposal.supportCaseId,
      actorType: "merchant",
      actorId: params.actorId,
      action: "resolution.errored",
      resourceType: "resolution_proposal",
      resourceId: proposal.id,
      metadata: { actionType, error: message },
    });

    return { status: "FAILED", reason: message };
  }
}

async function runAction(
  admin: AdminClient,
  actionType: ResolutionActionType,
  orderId: string,
  input: Record<string, unknown>,
): Promise<ActionReceipt> {
  switch (actionType) {
    case "UPDATE_ADDRESS": {
      const address1 = String(input.address_line_1 ?? "").trim();
      const city = String(input.city ?? "").trim();
      if (!address1 || !city) {
        throw createError(
          ErrorCodes.CALL_RESULT_INVALID,
          "Address result is missing a street line or city",
          "The call did not capture a complete address.",
        );
      }
      return updateShippingAddress(admin, orderId, {
        address1,
        address2: String(input.address_line_2 ?? ""),
        city,
        province: String(input.province_or_state ?? ""),
        zip: String(input.postal_code ?? ""),
        countryCode: String(input.country_code ?? "US"),
        ...(input.recipient_name ? { name: String(input.recipient_name) } : {}),
      });
    }

    case "CANCEL_ORDER":
      return cancelOrder(
        admin,
        orderId,
        String(input.summary ?? "Cancelled at the customer's request on a verified call."),
      );

    case "ADD_NOTE":
      return addOrderNote(admin, orderId, buildOrderNote(actionType, input));

    // Returns, refunds and replacements touch money and inventory. They are
    // deliberately not automated: the proposal is recorded and a note is written
    // to the order so a human picks it up in Shopify.
    case "CREATE_RETURN":
    case "CREATE_REFUND":
    case "REQUEST_REPLACEMENT":
      return addOrderNote(
        admin,
        orderId,
        `CallmeMaybe: customer requested ${actionType.replace(/_/g, " ").toLowerCase()} on a verified call. ${String(input.summary ?? "")}`,
      );

    default:
      throw createError(
        ErrorCodes.POLICY_BLOCKED,
        `No executor for action type ${actionType}`,
        "That resolution type cannot be applied automatically.",
      );
  }
}

function buildOrderNote(
  actionType: ResolutionActionType,
  input: Record<string, unknown>,
): string {
  if (actionType === "ADD_NOTE" && input.trace_opened) {
    // Carrier trace result — write a structured note the merchant can act on.
    const ref = input.trace_reference || "no reference provided";
    const disposition = input.carrier_disposition || "unknown";
    const promised = input.promised_response_by || "no ETA given";
    const hold = input.hold_time_minutes ? `${input.hold_time_minutes} min hold` : "";
    return [
      `📞 CallmeMaybe carrier trace`,
      `Trace: ${ref}`,
      `Status: ${disposition}`,
      `Expected: ${promised}`,
      hold,
      input.summary || "",
    ]
      .filter(Boolean)
      .join(" | ");
  }
  return String(input.summary ?? "CallmeMaybe note.");
}

async function markCaseResolved(
  supportCaseId: string,
  shopId: string,
  actorId: string,
  actionType: ResolutionActionType,
) {
  await prisma.supportCase.update({
    where: { id: supportCaseId },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
  await createAuditEvent({
    shopId,
    supportCaseId,
    actorType: "merchant",
    actorId,
    action: "resolution.completed_without_mutation",
    resourceType: "support_case",
    resourceId: supportCaseId,
    metadata: { actionType },
  });
}
