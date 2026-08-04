import type { ActionFunctionArgs } from "react-router";
import { getPhoneProvider } from "../providers/index.server";
import prisma from "../db.server";
import { sha256Hash } from "../lib/crypto.server";

export async function action({ request, params }: ActionFunctionArgs) {
  let receiptId: string | null = null;

  try {
    const callbackToken = params.token as string;
    const configuredToken = process.env.CALLE_WEBHOOK_TOKEN;

    // Verify token
    if (configuredToken && callbackToken !== configuredToken) {
      return Response.json(
        { error: "Invalid callback token" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const headers = request.headers;

    // CALL-E documents WebhookEvent.id as the idempotency key for webhook side
    // effects, so dedupe on it and fall back to a payload hash if it is absent.
    const payloadHash = sha256Hash(body?.id ?? JSON.stringify(body));
    const existing = await prisma.webhookReceipt.findFirst({
      where: { provider: "calle", payloadHash },
    });

    if (existing) {
      return Response.json({ status: "acknowledged", deduplicated: true });
    }

    // Store receipt
    const receipt = await prisma.webhookReceipt.create({
      data: {
        provider: "calle",
        externalEventId: body?.id ?? null,
        payloadHash,
        signatureValid: true,
        processed: false,
      },
    });
    receiptId = receipt.id;

    // Process webhook
    const provider = getPhoneProvider();
    const result = await provider.normalizeWebhook(body, headers);

    if (result.normalizedCall.providerCallId) {
      // Find the call attempt
      const callAttempt = await prisma.callAttempt.findFirst({
        where: { providerCallId: result.normalizedCall.providerCallId },
      });

      if (callAttempt) {
        // Import the process function dynamically to avoid circular deps
        const { processCallResult } = await import("../services/support-case.server");
        const supportCase = await prisma.supportCase.findUnique({
          where: { id: callAttempt.supportCaseId },
          select: { shopId: true },
        });
        await processCallResult(
          callAttempt.id,
          callAttempt.supportCaseId,
          supportCase?.shopId ?? "",
        );
      }
    }

    // Keep the receipt: it is what makes redelivery of the same event a no-op.
    await prisma.webhookReceipt.update({
      where: { id: receipt.id },
      data: { processed: true, processedAt: new Date() },
    });

    return Response.json({ status: "processed" });
  } catch (error) {
    console.error("[CalleWebhook] Error:", error);

    // Drop the receipt so a CALL-E redelivery of this event is retried rather
    // than silently swallowed by the dedup check above.
    if (receiptId) {
      await prisma.webhookReceipt
        .delete({ where: { id: receiptId } })
        .catch(() => {});
    }

    return Response.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
