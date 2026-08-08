/**
 * Optional LLM service for dynamic task-text generation.
 *
 * When configured (via DEEPSEEK_API_KEY or OPENAI_API_KEY), call-plan
 * instructions are generated from the order context by an LLM rather than
 * the static fill-in-the-blank templates. Falls back to static templates
 * when no key is set or the LLM call fails.
 *
 * The LLM is NEVER in the authorization path — it only writes the task
 * text CALL-E speaks from. Policy decisions remain deterministic.
 */

type LlmConfig = {
  provider: "deepseek" | "openai" | "none";
  apiKey: string;
  baseUrl: string;
  model: string;
};

function getConfig(): LlmConfig {
  if (process.env.DEEPSEEK_API_KEY) {
    return {
      provider: "deepseek",
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: "https://api.deepseek.com/v1",
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: "https://api.openai.com/v1",
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    };
  }
  return { provider: "none", apiKey: "", baseUrl: "", model: "" };
}

export function llmAvailable(): boolean {
  return getConfig().provider !== "none";
}

export async function generateCarrierTaskText(params: {
  storeName: string;
  agentName: string;
  carrierName: string;
  trackingNumber: string;
  shipDate: string;
  deliveryClaimDate: string;
  shipToSummary: string;
  merchantAccountNumber?: string;
  policyInstructions: string;
  orderContext?: string; // extra Shopify order details
}): Promise<string | null> {
  const cfg = getConfig();
  if (cfg.provider === "none") return null;

  const prompt = `Write the task instruction for an AI phone agent making an outbound call to a shipping carrier.

CONTEXT:
- The AI agent's name is "${params.agentName}" calling on behalf of "${params.storeName}".
- Carrier: ${params.carrierName}
- Tracking number: ${params.trackingNumber}
- Shipped: ${params.shipDate}
- Carrier claims delivered: ${params.deliveryClaimDate}
- Delivery address summary: ${params.shipToSummary}${params.merchantAccountNumber ? `\n- Shipper account: ${params.merchantAccountNumber}` : ""}${params.orderContext ? `\n- Additional order context: ${params.orderContext}` : ""}

BEHAVIOR RULES:
- The agent must disclose it is an AI assistant.
- The agent must state the call may be transcribed.
- The agent must navigate automated phone menus (IVR) if present.
- The agent must hold through silence and hold music.
- The agent must ask for a package trace or lost-package investigation.
- The agent must capture: trace/case reference number, carrier disposition, promised response date, and hold time.
- The agent must read the trace reference back to confirm.
- The agent must NOT accept a resolution on the customer's behalf, give payment details, or agree to refunds/reships.
- The agent must NOT claim to be human if asked.

POLICY:
${params.policyInstructions || "Standard shipping-claim policies apply."}

Return ONLY the task instruction text. No markdown, no commentary. Write in second person ("You are...") as direct instructions to the AI agent making the call.`;

  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: "system", content: "You write concise, clear task instructions for AI voice agents making outbound phone calls. Return only the instruction text, no markdown, no commentary." },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 1200,
      }),
    });

    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return json.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

export async function generateCustomerTaskText(params: {
  storeName: string;
  agentName: string;
  issueType: string;
  orderName: string;
  orderContext: string; // what's happening with this order
  policyInstructions: string;
}): Promise<string | null> {
  const cfg = getConfig();
  if (cfg.provider === "none") return null;

  const prompt = `Write the task instruction for an AI phone agent making a customer support call about an order.

CONTEXT:
- The AI agent's name is "${params.agentName}" calling on behalf of "${params.storeName}".
- Issue: ${params.issueType}
- Order: ${params.orderName}
- Situation: ${params.orderContext}

BEHAVIOR RULES:
- The agent must disclose it is an AI assistant and state the call may be transcribed.
- The agent must verify the person's identity by asking them to confirm their name and order number before disclosing any order details.
- If the name or order number do not match, politely end the call.
- The agent must NOT ask for codes, passwords, OTPs, payment details, or financial information.
- The agent must clearly identify ${params.storeName} and the order ${params.orderName} at the start.
- The agent must capture the customer's decision clearly.
- The agent must read back any consequential details (addresses, dates, amounts) and ask the customer to confirm.
- The agent must not offer discounts, refunds, or credits that were not authorized.

POLICY:
${params.policyInstructions || "Standard support policies apply."}

Return ONLY the task instruction text. No markdown, no commentary. Write in second person ("You are...").`;

  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: "system", content: "You write concise, clear task instructions for AI voice agents making customer support calls. Return only the instruction text." },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 1000,
      }),
    });

    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return json.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}
