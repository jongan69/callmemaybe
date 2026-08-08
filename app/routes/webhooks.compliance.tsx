import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  recordCustomerDataRequest,
  redactCustomerData,
  redactShopData,
} from "../services/privacy.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { eventId, payload, shop, topic } = await authenticate.webhook(request);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
      await recordCustomerDataRequest(shop, eventId, payload);
      break;
    case "CUSTOMERS_REDACT":
      await redactCustomerData(shop, payload);
      break;
    case "SHOP_REDACT":
      await redactShopData(shop);
      break;
    default:
      return new Response("Unsupported compliance topic", { status: 404 });
  }

  return new Response(null, { status: 200 });
};
