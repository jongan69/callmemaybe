import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { createPrivacyRequestReceipt } from "../services/privacy.server";
import { enqueueJob, JOBS } from "../queue.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { eventId, payload, shop, topic } = await authenticate.webhook(request);

  if (
    !["CUSTOMERS_DATA_REQUEST", "CUSTOMERS_REDACT", "SHOP_REDACT"].includes(
      topic,
    )
  )
    return new Response("Unsupported compliance topic", { status: 404 });

  const { request: privacyRequest } = await createPrivacyRequestReceipt({
    shopDomain: shop,
    topic: topic as
      "CUSTOMERS_DATA_REQUEST" | "CUSTOMERS_REDACT" | "SHOP_REDACT",
    eventId,
    payload,
  });
  await enqueueJob(
    JOBS.PRIVACY_REQUEST,
    { requestId: privacyRequest.id },
    `privacy:${privacyRequest.id}`,
  );

  return new Response(null, { status: 200 });
};
