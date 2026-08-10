import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  ProviderMode,
  ReleaseTarget,
  getProviderConfiguration,
  validateCalleBaseUrl,
  validateReleaseConfiguration,
} from "../app/services/config.server";
import {
  decrypt,
  encrypt,
  encryptionKeyVersion,
  rotateCiphertext,
} from "../app/lib/crypto.server";
import { getUsageWarnings } from "../app/services/billing.server";
import { sanitizeRequestUrl } from "../app/services/observability.server";
import { sanitizeTelemetry } from "../app/services/logger.server";
import { resolveRegionPolicyTimeZone } from "../app/lib/regions";

const originalEnvironment = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, originalEnvironment);
});

function productionEnvironment(
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    CALL_PROVIDER: "calle",
    CALLE_REAL_CALLS_ENABLED: "true",
    CALLE_API_KEY: "provider-key",
    CALLE_WEBHOOK_TOKEN: "x".repeat(40),
    CALLE_BASE_URL: "https://api.heycall-e.com",
    SHOPIFY_APP_URL: "https://app.callmemaybe.invalid",
    DATABASE_URL: "postgresql://user:pass@database/callmemaybe?sslmode=require",
    APP_ENCRYPTION_KEY: "1".repeat(64),
    APP_ENCRYPTION_KEY_VERSION: "2",
    APP_PREVIOUS_ENCRYPTION_KEYS_JSON: JSON.stringify({ 1: "2".repeat(64) }),
    HASH_PEPPER: "p".repeat(40),
    SHOPIFY_API_KEY: "shopify-key",
    SHOPIFY_API_SECRET: "shopify-secret",
    SHOPIFY_APP_GID: "gid://shopify/App/1",
    SHOPIFY_PARTNER_ORG_ID: "1",
    SHOPIFY_PARTNER_API_TOKEN: "partner-token",
    SENTRY_DSN: "https://public@example.invalid/1",
    BETTER_STACK_HEARTBEAT_URL: "https://uptime.example.invalid/heartbeat",
    LEGAL_DOCUMENT_VERSION: "counsel-approved-version",
    PUBLIC_SUPPORT_EMAIL: "support@example.invalid",
    PUBLIC_SECURITY_EMAIL: "security@example.invalid",
    PUBLIC_STATUS_URL: "https://status.example.invalid",
    RELEASE_TARGET: "hackathon",
    DEMO_SHOP_DOMAIN: "callmemaybe-demo.myshopify.com",
    DEMO_CARRIER_PHONE: "+15551234567",
    TEST_CUSTOMER_PHONE: "+15557654321",
    ...overrides,
  };
}

describe("production runtime configuration", () => {
  test("accepts the complete CALL-E production matrix", () => {
    const config = getProviderConfiguration(productionEnvironment());
    assert.deepEqual(config, {
      mode: ProviderMode.CALLE,
      liveCallsEnabled: true,
    });
  });

  test("keeps App Store-only operations values out of the runtime gate", () => {
    const environment = productionEnvironment({
      SHOPIFY_APP_GID: "",
      SHOPIFY_PARTNER_ORG_ID: "",
      SHOPIFY_PARTNER_API_TOKEN: "",
      SENTRY_DSN: "",
      BETTER_STACK_HEARTBEAT_URL: "",
      LEGAL_DOCUMENT_VERSION: "",
      PUBLIC_SUPPORT_EMAIL: "",
      PUBLIC_SECURITY_EMAIL: "",
      PUBLIC_STATUS_URL: "",
    });
    assert.doesNotThrow(() => getProviderConfiguration(environment));
    assert.equal(
      validateReleaseConfiguration(environment),
      ReleaseTarget.HACKATHON,
    );
  });

  test("retains the stricter Shopify App Store release gate", () => {
    assert.throws(
      () =>
        validateReleaseConfiguration(
          productionEnvironment({
            RELEASE_TARGET: "shopify-app-store",
            SENTRY_DSN: "",
          }),
        ),
      /Shopify App Store release configuration is incomplete: SENTRY_DSN/,
    );
    assert.equal(
      validateReleaseConfiguration(
        productionEnvironment({ RELEASE_TARGET: "shopify-app-store" }),
      ),
      ReleaseTarget.SHOPIFY_APP_STORE,
    );
  });

  test("refuses fixture, ambiguous, missing-auth, and non-PostgreSQL production modes", () => {
    assert.throws(
      () =>
        getProviderConfiguration(
          productionEnvironment({
            CALL_PROVIDER: "fixture",
            CALLE_REAL_CALLS_ENABLED: "false",
          }),
        ),
      /fixture/i,
    );
    assert.throws(
      () =>
        getProviderConfiguration(
          productionEnvironment({ CALLE_REAL_CALLS_ENABLED: "false" }),
        ),
      /requires/i,
    );
    assert.throws(
      () =>
        getProviderConfiguration(
          productionEnvironment({ CALLE_WEBHOOK_TOKEN: "short" }),
        ),
      /webhook/i,
    );
    assert.throws(
      () =>
        getProviderConfiguration(
          productionEnvironment({ DATABASE_URL: "file:dev.sqlite" }),
        ),
      /PostgreSQL/i,
    );
    assert.throws(
      () =>
        getProviderConfiguration(
          productionEnvironment({
            DATABASE_URL: "postgresql://database/callmemaybe",
          }),
        ),
      /TLS/i,
    );
    assert.throws(
      () =>
        getProviderConfiguration(
          productionEnvironment({ DEMO_MODE_ENABLED: "true" }),
        ),
      /demo/i,
    );
    assert.throws(
      () =>
        getProviderConfiguration(
          productionEnvironment({
            CALLE_BASE_URL: "https://test-api.heycall-e.com",
          }),
        ),
      /Refusing to send the CALL-E API key/i,
    );
  });

  test("allows only the exact official CALL-E production origin", () => {
    assert.equal(validateCalleBaseUrl(undefined), "https://api.heycall-e.com");
    assert.throws(
      () => validateCalleBaseUrl("https://test-api.heycall-e.com"),
      /Refusing to send the CALL-E API key/,
    );
    assert.throws(
      () => validateCalleBaseUrl("http://api.heycall-e.com"),
      /refusing/i,
    );
    assert.throws(
      () => validateCalleBaseUrl("https://api.heycall-e.com/v1"),
      /exact official CALL-E origin/i,
    );
    assert.throws(
      () => validateCalleBaseUrl("https://api.heycall-e.com/"),
      /exact official CALL-E origin/i,
    );
    assert.throws(
      () => validateCalleBaseUrl("https://api.heycall-e.com.attacker.invalid"),
      /refusing/i,
    );
  });
});

describe("versioned field encryption", () => {
  test("reads prior-key ciphertext and rotates it to the current key", () => {
    const firstKey = "a".repeat(64);
    const secondKey = "b".repeat(64);
    process.env.APP_ENCRYPTION_KEY_VERSION = "1";
    process.env.APP_ENCRYPTION_KEY = firstKey;
    process.env.APP_PREVIOUS_ENCRYPTION_KEYS_JSON = "{}";
    const oldCiphertext = encrypt("protected order context");
    assert.equal(encryptionKeyVersion(oldCiphertext), "1");

    process.env.APP_ENCRYPTION_KEY_VERSION = "2";
    process.env.APP_ENCRYPTION_KEY = secondKey;
    process.env.APP_PREVIOUS_ENCRYPTION_KEYS_JSON = JSON.stringify({
      1: firstKey,
    });
    assert.equal(decrypt(oldCiphertext), "protected order context");

    const rotated = rotateCiphertext(oldCiphertext);
    assert.equal(encryptionKeyVersion(rotated), "2");
    assert.equal(decrypt(rotated), "protected order context");
  });
});

describe("usage warnings", () => {
  test("emits exact included and overage thresholds", () => {
    assert.deepEqual(
      getUsageWarnings({ completedCalls: 199, includedLimit: 250 }),
      [],
    );
    assert.equal(
      getUsageWarnings({ completedCalls: 200, includedLimit: 250 })[0]
        ?.threshold,
      80,
    );
    assert.equal(
      getUsageWarnings({ completedCalls: 225, includedLimit: 250 })[0]
        ?.threshold,
      90,
    );
    assert.equal(
      getUsageWarnings({ completedCalls: 250, includedLimit: 250 })[0]
        ?.threshold,
      100,
    );
    const overageWarnings = getUsageWarnings({
      completedCalls: 2_050,
      includedLimit: 250,
    });
    assert.equal(
      overageWarnings.find((warning) => warning.scope === "overage")?.threshold,
      90,
    );
  });
});

describe("regional quiet-hour strategy", () => {
  test("accepts only explicit server-side timezone strategies", () => {
    assert.equal(
      resolveRegionPolicyTimeZone("fixed:Asia/Singapore"),
      "Asia/Singapore",
    );
    assert.equal(resolveRegionPolicyTimeZone("conservative:UTC"), "UTC");
    assert.equal(resolveRegionPolicyTimeZone("recipient"), null);
    assert.equal(resolveRegionPolicyTimeZone("fixed:Not/A_Zone"), null);
  });
});

describe("observability redaction", () => {
  test("strips query credentials and callback path secrets from request URLs", () => {
    assert.equal(
      sanitizeRequestUrl(
        "https://app.example.invalid/webhooks/calle/provider-secret?attempt=case-id&nonce=callback-secret",
      ),
      "https://app.example.invalid/webhooks/calle/[REDACTED]",
    );
    assert.equal(
      sanitizeRequestUrl(
        "https://app.example.invalid/app?shop=merchant.myshopify.com",
      ),
      "https://app.example.invalid/app",
    );
  });

  test("redacts authorization values and callback credentials in arbitrary strings", () => {
    const sanitized = sanitizeTelemetry({
      detail:
        "Bearer provider-secret at /webhooks/calle/path-secret?attempt=attempt-id&nonce=nonce-secret",
    });
    assert.equal(
      sanitized.detail,
      "Bearer [REDACTED] at /webhooks/calle/[REDACTED]?attempt=[REDACTED]&nonce=[REDACTED]",
    );
  });
});
