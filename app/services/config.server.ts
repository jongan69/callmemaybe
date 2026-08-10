import { z } from "zod";

export const ProviderMode = {
  FIXTURE: "fixture",
  CALLE: "calle",
} as const;

export type ProviderMode = (typeof ProviderMode)[keyof typeof ProviderMode];

export const ReleaseTarget = {
  HACKATHON: "hackathon",
  SHOPIFY_APP_STORE: "shopify-app-store",
} as const;

export type ReleaseTarget = (typeof ReleaseTarget)[keyof typeof ReleaseTarget];

const ProviderEnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  RELEASE_TARGET: z
    .enum([ReleaseTarget.HACKATHON, ReleaseTarget.SHOPIFY_APP_STORE])
    .default(ReleaseTarget.HACKATHON),
  CALL_PROVIDER: z
    .enum([ProviderMode.FIXTURE, ProviderMode.CALLE])
    .default(ProviderMode.FIXTURE),
  CALLE_REAL_CALLS_ENABLED: z.enum(["true", "false"]).default("false"),
  CALLE_API_KEY: z.string().optional(),
  CALLE_WEBHOOK_TOKEN: z.string().optional(),
  CALLE_BASE_URL: z.string().optional(),
  SHOPIFY_APP_URL: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  APP_ENCRYPTION_KEY: z.string().optional(),
  APP_ENCRYPTION_KEY_VERSION: z.string().optional(),
  APP_PREVIOUS_ENCRYPTION_KEYS_JSON: z.string().optional(),
  HASH_PEPPER: z.string().optional(),
  SHOPIFY_API_KEY: z.string().optional(),
  SHOPIFY_API_SECRET: z.string().optional(),
  SHOPIFY_APP_GID: z.string().optional(),
  SHOPIFY_PARTNER_ORG_ID: z.string().optional(),
  SHOPIFY_PARTNER_API_TOKEN: z.string().optional(),
  SENTRY_DSN: z.string().url().optional().or(z.literal("")),
  BETTER_STACK_HEARTBEAT_URL: z.string().url().optional().or(z.literal("")),
  LEGAL_DOCUMENT_VERSION: z.string().optional(),
  PUBLIC_SUPPORT_EMAIL: z.string().email().optional().or(z.literal("")),
  PUBLIC_SECURITY_EMAIL: z.string().email().optional().or(z.literal("")),
  PUBLIC_STATUS_URL: z.string().url().optional().or(z.literal("")),
  DEMO_SHOP_DOMAIN: z.string().optional(),
  DEMO_CARRIER_PHONE: z.string().optional(),
  TEST_CUSTOMER_PHONE: z.string().optional(),
});

export type ProviderConfiguration = {
  mode: ProviderMode;
  liveCallsEnabled: boolean;
};

export function getProviderConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): ProviderConfiguration {
  const parsed = ProviderEnvironmentSchema.safeParse(environment);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid runtime configuration: ${problems}`);
  }

  const liveCallsEnabled = parsed.data.CALLE_REAL_CALLS_ENABLED === "true";
  if (parsed.data.CALL_PROVIDER === ProviderMode.CALLE && !liveCallsEnabled) {
    throw new Error(
      "CALL_PROVIDER=calle requires CALLE_REAL_CALLS_ENABLED=true; refusing to present a fixture result.",
    );
  }
  if (parsed.data.CALL_PROVIDER === ProviderMode.FIXTURE && liveCallsEnabled) {
    throw new Error(
      "CALLE_REAL_CALLS_ENABLED=true requires CALL_PROVIDER=calle; refusing ambiguous live-call configuration.",
    );
  }
  const calleBaseUrl = validateCalleBaseUrl(parsed.data.CALLE_BASE_URL);

  if (parsed.data.NODE_ENV === "production") {
    if (parsed.data.CALL_PROVIDER !== ProviderMode.CALLE) {
      throw new Error(
        "Production refuses to start with the fixture call provider.",
      );
    }
    if (!parsed.data.CALLE_API_KEY) {
      throw new Error("CALLE_API_KEY is required in production.");
    }
    if (calleBaseUrl !== "https://api.heycall-e.com") {
      throw new Error("Production requires the CALL-E production API origin.");
    }
    if (
      !parsed.data.CALLE_WEBHOOK_TOKEN ||
      parsed.data.CALLE_WEBHOOK_TOKEN.length < 32
    ) {
      throw new Error(
        "CALLE_WEBHOOK_TOKEN must contain at least 32 characters in production.",
      );
    }
    if (!parsed.data.SHOPIFY_APP_URL?.startsWith("https://")) {
      throw new Error(
        "SHOPIFY_APP_URL must be a public HTTPS URL in production.",
      );
    }
    validateProductionAppUrl(parsed.data.SHOPIFY_APP_URL);
    validateProductionDatabaseUrl(parsed.data.DATABASE_URL);
    if (!/^[a-fA-F0-9]{64}$/.test(parsed.data.APP_ENCRYPTION_KEY ?? "")) {
      throw new Error(
        "APP_ENCRYPTION_KEY must be a 64-character hex key in production.",
      );
    }
    if (!/^\d+$/.test(parsed.data.APP_ENCRYPTION_KEY_VERSION ?? "")) {
      throw new Error(
        "APP_ENCRYPTION_KEY_VERSION must be a numeric version in production.",
      );
    }
    validatePreviousEncryptionKeys(
      parsed.data.APP_PREVIOUS_ENCRYPTION_KEYS_JSON,
      parsed.data.APP_ENCRYPTION_KEY_VERSION!,
    );
    if (!parsed.data.HASH_PEPPER || parsed.data.HASH_PEPPER.length < 32) {
      throw new Error(
        "HASH_PEPPER must contain at least 32 characters in production.",
      );
    }
    const requiredRuntimeShopifyValues = [
      ["SHOPIFY_API_KEY", parsed.data.SHOPIFY_API_KEY],
      ["SHOPIFY_API_SECRET", parsed.data.SHOPIFY_API_SECRET],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);
    if (requiredRuntimeShopifyValues.length > 0) {
      throw new Error(
        `Production Shopify runtime configuration is incomplete: ${requiredRuntimeShopifyValues.join(", ")}.`,
      );
    }
    if (environment.BILLING_BYPASS_DEVELOPMENT === "true") {
      throw new Error(
        "BILLING_BYPASS_DEVELOPMENT cannot be enabled in production.",
      );
    }
    if (environment.ENABLE_DYNAMIC_LLM_TASKS === "true") {
      throw new Error(
        "Dynamic third-party LLM task generation is forbidden in production.",
      );
    }
    if (
      environment.DEMO_MODE_ENABLED === "true" ||
      environment.DEMO_SEED === "true"
    ) {
      throw new Error(
        "Demo routes and demo seeding are forbidden in production.",
      );
    }
  }

  return { mode: parsed.data.CALL_PROVIDER, liveCallsEnabled };
}

function validateProductionAppUrl(value: string): void {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "") ||
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
  ) {
    throw new Error(
      "SHOPIFY_APP_URL must be a public HTTPS origin without credentials, query, or path.",
    );
  }
}

function validateProductionDatabaseUrl(value: string | undefined): void {
  if (!value?.startsWith("postgres")) {
    throw new Error("Production requires a PostgreSQL DATABASE_URL.");
  }
  const url = new URL(value);
  if (
    !new Set(["require", "verify-ca", "verify-full"]).has(
      url.searchParams.get("sslmode") ?? "",
    )
  ) {
    throw new Error(
      "Production PostgreSQL must require TLS with sslmode=require, verify-ca, or verify-full.",
    );
  }
}

function validatePreviousEncryptionKeys(
  value: string | undefined,
  currentVersion: string,
): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value || "{}");
  } catch {
    throw new Error("APP_PREVIOUS_ENCRYPTION_KEYS_JSON must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("APP_PREVIOUS_ENCRYPTION_KEYS_JSON must be a JSON object.");
  }
  for (const [version, key] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    if (
      !/^\d+$/.test(version) ||
      !/^[a-fA-F0-9]{64}$/.test(String(key)) ||
      version === currentVersion
    ) {
      throw new Error(
        "APP_PREVIOUS_ENCRYPTION_KEYS_JSON contains an invalid or current-version key.",
      );
    }
  }
}

const OFFICIAL_CALLE_ORIGIN = "https://api.heycall-e.com";

export function validateCalleBaseUrl(baseUrl: string | undefined): string {
  if (!baseUrl) return OFFICIAL_CALLE_ORIGIN;
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(
      `Refusing to use invalid CALLE_BASE_URL "${baseUrl}". Expected an official CALL-E HTTPS origin.`,
    );
  }
  if (parsed.origin !== OFFICIAL_CALLE_ORIGIN) {
    throw new Error(
      `Refusing to send the CALL-E API key to "${parsed.origin}". CALLE_BASE_URL must be exactly ${OFFICIAL_CALLE_ORIGIN}.`,
    );
  }
  if (baseUrl !== OFFICIAL_CALLE_ORIGIN) {
    throw new Error(
      `Refusing to use CALLE_BASE_URL "${baseUrl}". It must be the exact official CALL-E origin without normalization.`,
    );
  }
  if (
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error(
      `Refusing to use CALLE_BASE_URL "${baseUrl}". Only the origin itself is allowed.`,
    );
  }
  return parsed.origin;
}

export function validateRuntimeConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): void {
  getProviderConfiguration(environment);
}

export function validateReleaseConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): ReleaseTarget {
  if (environment.NODE_ENV !== "production") {
    throw new Error("Release validation requires NODE_ENV=production.");
  }

  getProviderConfiguration(environment);
  const parsed = ProviderEnvironmentSchema.parse(environment);

  if (parsed.RELEASE_TARGET === ReleaseTarget.HACKATHON) {
    if (!parsed.DEMO_SHOP_DOMAIN?.endsWith(".myshopify.com")) {
      throw new Error(
        "Hackathon release validation requires an installed DEMO_SHOP_DOMAIN ending in .myshopify.com.",
      );
    }
    validateControlledPhone("DEMO_CARRIER_PHONE", parsed.DEMO_CARRIER_PHONE);
    validateControlledPhone("TEST_CUSTOMER_PHONE", parsed.TEST_CUSTOMER_PHONE);
    if (parsed.DEMO_CARRIER_PHONE === parsed.TEST_CUSTOMER_PHONE) {
      throw new Error(
        "Hackathon validation requires distinct controlled carrier and customer phone numbers.",
      );
    }
    return ReleaseTarget.HACKATHON;
  }

  const requiredAppStoreValues = [
    ["SHOPIFY_APP_GID", parsed.SHOPIFY_APP_GID],
    ["SHOPIFY_PARTNER_ORG_ID", parsed.SHOPIFY_PARTNER_ORG_ID],
    ["SHOPIFY_PARTNER_API_TOKEN", parsed.SHOPIFY_PARTNER_API_TOKEN],
    ["LEGAL_DOCUMENT_VERSION", parsed.LEGAL_DOCUMENT_VERSION],
    ["PUBLIC_SUPPORT_EMAIL", parsed.PUBLIC_SUPPORT_EMAIL],
    ["PUBLIC_SECURITY_EMAIL", parsed.PUBLIC_SECURITY_EMAIL],
    ["PUBLIC_STATUS_URL", parsed.PUBLIC_STATUS_URL],
    ["SENTRY_DSN", parsed.SENTRY_DSN],
    ["BETTER_STACK_HEARTBEAT_URL", parsed.BETTER_STACK_HEARTBEAT_URL],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (requiredAppStoreValues.length > 0) {
    throw new Error(
      `Shopify App Store release configuration is incomplete: ${requiredAppStoreValues.join(", ")}.`,
    );
  }
  return ReleaseTarget.SHOPIFY_APP_STORE;
}

function validateControlledPhone(name: string, value: string | undefined) {
  if (!value || !/^\+[1-9]\d{7,14}$/.test(value)) {
    throw new Error(`${name} must be a controlled E.164 phone number.`);
  }
}
