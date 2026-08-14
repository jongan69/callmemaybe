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
          shopPolicies {
            id
            title
            body
            url
            type
            updatedAt
          }
        }
      }
    `;

    const response = await admin.graphql(query);
    const json = (await response.json()) as {
      data?: {
        shop?: {
          shopPolicies?: Array<{
            id: string;
            title: string;
            body: string;
            url: string;
            type: string;
            updatedAt: string;
          }>;
        };
      };
    };

    const shop = json.data?.shop;
    if (!shop) {
      errors.push("Could not fetch shop policies");
      return { synced: 0, errors };
    }

    const appliesToByType: Record<string, string[]> = {
      REFUND_POLICY: [
        "RETURN",
        "CANCELLATION",
        "DAMAGED_ITEM",
        "WRONG_ITEM",
        "MISSING_ITEM",
      ],
      SHIPPING_POLICY: [
        "ORDER_STATUS",
        "ADDRESS_CHANGE",
        "CARRIER_TRACE",
        "STUCK_ORDER_OUTREACH",
      ],
      PRIVACY_POLICY: [],
      TERMS_OF_SERVICE: ["OTHER"],
      SUBSCRIPTION_POLICY: ["OTHER"],
    };

    for (const data of shop.shopPolicies ?? []) {
      if (!data?.body) continue;

      const content = stripHtml(data.body);
      const contentHash = sha256Hash(content);
      const appliesTo = appliesToByType[data.type] ?? [];

      // Check if already synced
      const existing = await prisma.knowledgeSource.findFirst({
        where: { shopId, sourceType: "SHOP_POLICY", externalId: data.id },
      });

      if (existing && existing.contentHash === contentHash) continue;

      if (existing) {
        await prisma.knowledgeSource.update({
          where: { id: existing.id },
          data: {
            normalizedContent: content,
            contentHash,
            appliesToJson: JSON.stringify(appliesTo),
            sourceUpdatedAt: new Date(data.updatedAt),
            syncedAt: new Date(),
            status: "active",
          },
        });
      } else {
        await prisma.knowledgeSource.create({
          data: {
            shopId,
            sourceType: "SHOP_POLICY",
            externalId: data.id,
            title: data.title || data.type.replace(/_/g, " "),
            normalizedContent: content,
            contentHash,
            appliesToJson: JSON.stringify(appliesTo),
            status: "active",
            sourceUpdatedAt: new Date(data.updatedAt),
          },
        });
      }
      synced++;
    }

    return { synced, errors };
  } catch (e) {
    errors.push(
      e instanceof Error ? e.message : "Unknown error syncing policies",
    );
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
  let text = "";
  let inTag = false;
  for (const character of html) {
    if (character === "<") {
      inTag = true;
      text += " ";
    } else if (character === ">" && inTag) {
      inTag = false;
    } else if (!inTag) {
      text += character;
    }
  }

  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
  };
  return text
    .replace(/&(amp|lt|gt|quot|#39);/g, (entity) => entities[entity] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
}

function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength) + "...";
}
