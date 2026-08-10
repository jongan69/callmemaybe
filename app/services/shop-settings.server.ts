import prisma from "../db.server";
import type { AdminClient } from "./shopify-adapter.server";

export async function ensureShopSettings(
  admin: AdminClient,
  shopDomain: string,
) {
  const existing = await prisma.shopSettings.findUnique({
    where: { shopDomain },
  });
  if (existing?.shopifyShopId.startsWith("gid://shopify/Shop/"))
    return existing;
  const response = await admin.graphql(`#graphql
    query CallMeMaybeInstallShop {
      shop { id name ianaTimezone }
    }
  `);
  const body = (await response.json()) as {
    data?: { shop?: { id?: string; name?: string; ianaTimezone?: string } };
  };
  const shop = body.data?.shop;
  if (!shop?.id)
    throw new Error("Shopify did not return the installed shop identity.");
  return prisma.shopSettings.upsert({
    where: { shopDomain },
    create: {
      shopDomain,
      shopifyShopId: shop.id,
      storeName: shop.name || "My Store",
      businessIdentity: shop.name || null,
      timezone: shop.ianaTimezone || "UTC",
    },
    update: {
      shopifyShopId: shop.id,
      storeName: shop.name || undefined,
      timezone: shop.ianaTimezone || undefined,
    },
  });
}
