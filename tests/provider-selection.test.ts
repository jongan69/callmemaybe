import { test } from "node:test";
import assert from "node:assert/strict";
import { getProviderMode, isFakeMode } from "../app/providers/index.server";

test("live mode requires both exact gate values", async () => {
  const originalProvider = process.env.CALL_PROVIDER;
  const originalLiveGate = process.env.CALLE_REAL_CALLS_ENABLED;

  try {
    process.env.CALL_PROVIDER = "calle";
    process.env.CALLE_REAL_CALLS_ENABLED = "true";

    assert.equal(getProviderMode(), "calle");
    assert.equal(isFakeMode(), false);

    process.env.CALL_PROVIDER = "calle";
    process.env.CALLE_REAL_CALLS_ENABLED = "TRUE";

    assert.equal(getProviderMode(), "fake");
    assert.equal(isFakeMode(), true);

    process.env.CALL_PROVIDER = "cale";
    process.env.CALLE_REAL_CALLS_ENABLED = "true";

    assert.equal(getProviderMode(), "fake");
    assert.equal(isFakeMode(), true);

    // Exercise the cached selector through an isolated module instance so this
    // test cannot leave the shared provider cache in fake mode for later tests.
    const isolatedModuleUrl = new URL(
      "../app/providers/index.server.ts?provider-selection-test",
      import.meta.url,
    ).href;
    const isolatedProviderModule = (await import(isolatedModuleUrl)) as typeof import(
      "../app/providers/index.server"
    );
    assert.strictEqual(
      isolatedProviderModule.getPhoneProvider(),
      isolatedProviderModule.getFakeProvider(),
    );
  } finally {
    if (originalProvider === undefined) {
      delete process.env.CALL_PROVIDER;
    } else {
      process.env.CALL_PROVIDER = originalProvider;
    }

    if (originalLiveGate === undefined) {
      delete process.env.CALLE_REAL_CALLS_ENABLED;
    } else {
      process.env.CALLE_REAL_CALLS_ENABLED = originalLiveGate;
    }
  }
});
