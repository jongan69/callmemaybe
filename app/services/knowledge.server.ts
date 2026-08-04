import prisma from "../db.server";
import { sha256Hash } from "../lib/crypto.server";
import type { AdminClient } from "./shopify-adapter.server";

export async function syncShopPolicies(
  admin: AdminClient,
  shopId: string,
): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];
  let synced = 0;

  try {
    // Fetch shop policies via Admin GraphQL
    const query = `#graphql
      query GetShopPolicies {
        shop {
          refundPolicy { title body url }
          shippingPolicy { title body url }
          privacyPolicy { title body url }
          termsOfService { title body url }
        }
      }
    `;

    const response = await admin.graphql(query);
    const json = (await response.json()) as {
      data?: {
        shop?: {
          refundPolicy?: { title: string; body: string; url: string };
          shippingPolicy?: { title: string; body: string; url: string };
          privacyPolicy?: { title: string; body: string; url: string };
          termsOfService?: { title: string; body: string; url: string };
        };
      };
    };

    const shop = json.data?.shop;
    if (!shop) {
      errors.push("Could not fetch shop policies");
      return { synced: 0, errors };
    }

    const policies = [
      { type: "SHOP_POLICY", data: shop.refundPolicy, appliesTo: ["RETURN", "CANCELLATION", "DAMAGED_ITEM", "WRONG_ITEM", "MISSING_ITEM"] },
      { type: "SHOP_POLICY", data: shop.shippingPolicy, appliesTo: ["ORDER_STATUS", "ADDRESS_CHANGE"] },
      { type: "SHOP_POLICY", data: shop.privacyPolicy, appliesTo: [] },
      { type: "SHOP_POLICY", data: shop.termsOfService, appliesTo: ["OTHER"] },
    ];

    for (const { type, data, appliesTo } of policies) {
      if (!data?.body) continue;

      const content = stripHtml(data.body);
      const contentHash = sha256Hash(content);

      // Check if already synced
      const existing = await prisma.knowledgeSource.findFirst({
        where: { shopId, sourceType: type, externalId: data.url ?? type },
      });

      if (existing && existing.contentHash === contentHash) continue;

      if (existing) {
        await prisma.knowledgeSource.update({
          where: { id: existing.id },
          data: {
            normalizedContent: content,
            contentHash,
            appliesToJson: JSON.stringify(appliesTo),
            sourceUpdatedAt: new Date(),
            syncedAt: new Date(),
            status: "active",
          },
        });
      } else {
        await prisma.knowledgeSource.create({
          data: {
            shopId,
            sourceType: type,
            externalId: data.url ?? type,
            title: data.title || type.replace(/_/g, " "),
            normalizedContent: content,
            contentHash,
            appliesToJson: JSON.stringify(appliesTo),
            status: "active",
            sourceUpdatedAt: new Date(),
          },
        });
      }
      synced++;
    }

    return { synced, errors };
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "Unknown error syncing policies");
    return { synced, errors };
  }
}

export async function getKnowledgeForIssue(
  shopId: string,
  issueType: string,
): Promise<Array<{ title: string; content: string }>> {
  const sources = await prisma.knowledgeSource.findMany({
    where: {
      shopId,
      status: "active",
      appliesToJson: {
        contains: issueType,
      },
    },
    orderBy: { syncedAt: "desc" },
  });

  if (sources.length === 0) {
    // Fall back to generic sources
    const generic = await prisma.knowledgeSource.findMany({
      where: { shopId, status: "active" },
      orderBy: { syncedAt: "desc" },
      take: 5,
    });
    return generic.map((s) => ({
      title: s.title,
      content: truncateContent(s.normalizedContent, 2000),
    }));
  }

  return sources.map((s) => ({
    title: s.title,
    content: truncateContent(s.normalizedContent, 2000),
  }));
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength) + "...";
}
