import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { decrypt } from "../lib/crypto.server";
import { createAuditEvent } from "../services/audit.server";

const OrderIdSchema = z.string().regex(/^gid:\/\/shopify\/Order\/[^/?#]+$/);

export async function loader({ request }: LoaderFunctionArgs) {
  const { sessionToken, cors } =
    await authenticate.public.customerAccount(request);

  try {
    const url = new URL(request.url);
    const parsedOrderId = OrderIdSchema.safeParse(
      url.searchParams.get("orderId"),
    );
    const shopDomain = String(sessionToken.dest ?? "").replace(
      /^https?:\/\//,
      "",
    );
    const customerId = String(sessionToken.sub ?? "");

    if (!parsedOrderId.success || !customerId) {
      return cors(
        Response.json(
          {
            error: { code: "VALIDATION_ERROR", message: "orderId is required" },
          },
          { status: 400 },
        ),
      );
    }
    const orderId = parsedOrderId.data;

    const settings = await prisma.shopSettings.findUnique({
      where: { shopDomain },
      select: { id: true },
    });

    if (!settings) {
      return cors(Response.json({ case: null }));
    }

    const case_ = await prisma.supportCase.findFirst({
      where: {
        shopId: settings.id,
        shopifyCustomerId: customerId,
        shopifyOrderId: orderId,
        status: { notIn: ["CLOSED", "CANCELED"] },
      },
      orderBy: { createdAt: "desc" },
      include: {
        callAttempts: { orderBy: { createdAt: "desc" }, take: 1 },
        verificationChallenge: true,
      },
    });

    if (!case_) {
      return cors(Response.json({ case: null }));
    }

    const challenge = case_.verificationChallenge;
    const verificationCode =
      challenge &&
      challenge.expiresAt > new Date() &&
      !challenge.verifiedAt &&
      !challenge.invalidatedAt
        ? decrypt(challenge.codeEncrypted)
        : null;
    if (verificationCode) {
      await createAuditEvent({
        shopId: settings.id,
        supportCaseId: case_.id,
        actorType: "customer",
        actorId: customerId,
        action: "verification_code.viewed",
        resourceType: "verification_challenge",
        resourceId: challenge!.id,
      });
    }
    return cors(
      Response.json({
        case: {
          reference: case_.publicReference,
          status: case_.status,
          issueType: case_.issueType,
          callStatus: case_.callAttempts[0]?.status ?? null,
          callOutcome: case_.callAttempts[0]?.outcome ?? null,
          createdAt: case_.createdAt.toISOString(),
          verificationCode,
          codeExpiresAt: challenge?.expiresAt.toISOString() ?? null,
        },
      }),
    );
  } catch (error) {
    console.error("[CustomerLatestCaseAPI] Error:", error);
    return cors(
      Response.json(
        {
          error: { code: "INTERNAL_ERROR", message: "Failed to retrieve case" },
        },
        { status: 500 },
      ),
    );
  }
}
