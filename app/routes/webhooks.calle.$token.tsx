import type { ActionFunctionArgs } from "react-router";
import { getPhoneProvider } from "../providers/index.server";
import prisma from "../db.server";
import { sha256Hash, verifySecretHash } from "../lib/crypto.server";
import crypto from "node:crypto";
import { z } from "zod";
import { captureOperationalError } from "../services/observability.server";
import { logEvent } from "../services/logger.server";
import { processCallResult } from "../services/support-case.server";

const CalleWebhookV1 = z
  .object({
    id: z.string().min(1).max(200),
    type: z.string().min(1).max(200),
    created_at: z.string().datetime({ offset: true }),
    data: z.object({ id: z.string().min(1).max(200) }).passthrough(),
  })
  .passthrough();

export async function action({ request, params }: ActionFunctionArgs) {
  let receiptId: string | null = null;

  try {
    const callbackToken = params.token;
    const configuredToken = process.env.CALLE_WEBHOOK_TOKEN;

    if (!configuredToken) {
      logEvent("error", "calle.webhook_unconfigured");
      return Response.json({ error: "Webhook unavailable" }, { status: 503 });
    }
    if (!callbackToken || !constantTimeEqual(callbackToken, configuredToken)) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const url = new URL(request.url);
    const callAttemptId = url.searchParams.get("attempt");
    const callbackNonce = url.searchParams.get("nonce");
    if (!callAttemptId || !callbackNonce) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    const expectedAttempt = await prisma.callAttempt.findUnique({
      where: { id: callAttemptId },
    });
    if (
      !expectedAttempt?.callbackNonceHash ||
      !expectedAttempt.callbackExpiresAt ||
      expectedAttempt.callbackExpiresAt <= new Date() ||
      !verifySecretHash(callbackNonce, expectedAttempt.callbackNonceHash)
    ) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const parsedBody = CalleWebhookV1.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsedBody.success) {
      return Response.json({ error: "Invalid callback" }, { status: 400 });
    }
    const body = parsedBody.data;
    if (new Date(body.created_at).getTime() > Date.now() + 10 * 60 * 1000) {
      return Response.json(
        { error: "Invalid callback timestamp" },
        { status: 400 },
      );
    }
    const headers = request.headers;

    // CALL-E documents WebhookEvent.id as the idempotency key for webhook side
    // effects, so dedupe on it and fall back to a payload hash if it is absent.
    const payloadHash = sha256Hash(body.id);
    const existing = await prisma.webhookReceipt.findFirst({
      where: { provider: "calle", payloadHash },
    });

    if (existing) {
      return Response.json({ status: "acknowledged", deduplicated: true });
    }

    // Store receipt
    const receipt = await prisma.webhookReceipt
      .create({
        data: {
          provider: "calle",
          externalEventId: body.id,
          payloadHash,
          signatureValid: true,
          processed: false,
        },
      })
      .catch((error: unknown) => {
        if ((error as { code?: string }).code === "P2002") return null;
        throw error;
      });
    if (!receipt) {
      return Response.json({ status: "acknowledged", deduplicated: true });
    }
    receiptId = receipt.id;

    // Process webhook
    const provider = getPhoneProvider();
    const result = await provider.normalizeWebhook(body, headers);
    if (
      !expectedAttempt.providerCallId ||
      result.normalizedCall.providerCallId !== expectedAttempt.providerCallId
    ) {
      throw new Error(
        "CALL-E callback call ID did not match its bound call attempt",
      );
    }

    if (result.normalizedCall.providerCallId) {
      // Find the call attempt
      const callAttempt = await prisma.callAttempt.findFirst({
        where: { id: expectedAttempt.id },
      });

      if (callAttempt) {
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
    captureOperationalError(error, { event: "calle.webhook_failed" });
    logEvent("error", "calle.webhook_failed");

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

function constantTimeEqual(left: string, right: string): boolean {
  const leftHash = crypto.createHash("sha256").update(left).digest();
  const rightHash = crypto.createHash("sha256").update(right).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}
