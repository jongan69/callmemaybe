import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { decryptPrivacyExport } from "../services/privacy.server";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const privacyRequest = await db.privacyRequest.findFirst({
    where: {
      id: params.id,
      shopDomain: session.shop,
      topic: "CUSTOMERS_DATA_REQUEST",
      status: "READY_FOR_MERCHANT",
      expiresAt: { gt: new Date() },
    },
  });

  if (!privacyRequest?.exportEncrypted) {
    throw new Response("Privacy export not found or expired", { status: 404 });
  }

  return new Response(
    JSON.stringify(
      decryptPrivacyExport(privacyRequest.exportEncrypted),
      null,
      2,
    ),
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="callmemaybe-privacy-${privacyRequest.id}.json"`,
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
};
