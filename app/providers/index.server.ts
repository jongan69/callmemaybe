import type { PhoneSupportProvider } from "../lib/types";
import { getFakeProvider } from "./fake-calle.server";
import { CallePhoneSupportProvider } from "./calle-provider.server";

let provider: PhoneSupportProvider | null = null;

export function getPhoneProvider(): PhoneSupportProvider {
  if (!provider) {
    if (!isCalleLiveMode()) {
      provider = getFakeProvider();
    } else {
      // Once both live-call gates are deliberately enabled, a configuration
      // error must be loud. Silently falling back to fixtures would make a demo
      // look successful without ever using CALL-E.
      provider = new CallePhoneSupportProvider();
      console.log("[CallmeMaybe] Using real CALL-E provider");
    }
  }
  return provider;
}

export function isFakeMode(): boolean {
  return !isCalleLiveMode();
}

export function getProviderMode(): "fake" | "calle" {
  return isCalleLiveMode() ? "calle" : "fake";
}

function isCalleLiveMode(): boolean {
  return (
    process.env.CALL_PROVIDER === "calle" &&
    process.env.CALLE_REAL_CALLS_ENABLED === "true"
  );
}

export { getFakeProvider } from "./fake-calle.server";
export { CallePhoneSupportProvider } from "./calle-provider.server";
