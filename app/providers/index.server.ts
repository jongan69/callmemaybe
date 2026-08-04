import type { PhoneSupportProvider } from "../lib/types";
import { getFakeProvider } from "./fake-calle.server";
import { CallePhoneSupportProvider } from "./calle-provider.server";

let provider: PhoneSupportProvider | null = null;

export function getPhoneProvider(): PhoneSupportProvider {
  if (!provider) {
    const mode = process.env.CALL_PROVIDER || "fake";
    if (mode === "fake" || process.env.CALLE_REAL_CALLS_ENABLED !== "true") {
      provider = getFakeProvider();
    } else {
      try {
        provider = new CallePhoneSupportProvider();
        console.log("[CallmeMaybe] Using real CALL-E provider");
      } catch (error) {
        console.warn(
          "[CallmeMaybe] Failed to initialize CALL-E provider, falling back to fake:",
          error instanceof Error ? error.message : error,
        );
        provider = getFakeProvider();
      }
    }
  }
  return provider;
}

export function isFakeMode(): boolean {
  return (
    process.env.CALL_PROVIDER !== "calle" ||
    process.env.CALLE_REAL_CALLS_ENABLED !== "true"
  );
}

export function getProviderMode(): "fake" | "calle" {
  if (process.env.CALL_PROVIDER === "calle" && process.env.CALLE_REAL_CALLS_ENABLED === "true") {
    return "calle";
  }
  return "fake";
}

export { getFakeProvider } from "./fake-calle.server";
export { CallePhoneSupportProvider } from "./calle-provider.server";
