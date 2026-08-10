import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }
  const settings = await db.shopSettings.findUnique({
    where: { shopDomain: shop },
  });
  if (settings) {
    await db.$transaction([
      db.shopSettings.update({
        where: { id: settings.id },
        data: { globalCallingEnabled: false },
      }),
      db.shopSubscription.upsert({
        where: { shopId: settings.id },
        create: {
          shopId: settings.id,
          shopifyShopId: settings.shopifyShopId,
          status: "CANCELED",
          synchronizedAt: new Date(),
        },
        update: { status: "CANCELED", synchronizedAt: new Date() },
      }),
    ]);
  }

  return Response.json({ acknowledged: topic === "APP_UNINSTALLED" });
};
