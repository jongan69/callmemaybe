import type { PhoneSupportProvider } from "../lib/types";
import { getFakeProvider } from "./fake-calle.server";
import { CallePhoneSupportProvider } from "./calle-provider.server";
import {
  getProviderConfiguration,
  ProviderMode,
} from "../services/config.server";

let provider: PhoneSupportProvider | null = null;

export function getPhoneProvider(): PhoneSupportProvider {
  if (!provider) {
    const { mode } = getProviderConfiguration();
    if (mode === ProviderMode.CALLE) {
      provider = new CallePhoneSupportProvider();
      console.log("[CallMeMaybe] Using real CALL-E provider");
    } else {
      provider = getFakeProvider();
    }
  }
  return provider;
}

export function isFakeMode(): boolean {
  return getProviderConfiguration().mode === ProviderMode.FIXTURE;
}

export function getProviderMode(): "fixture" | "calle" {
  return getProviderConfiguration().mode;
}

export function resetPhoneProviderForTests(): void {
  provider = null;
}

export { getFakeProvider } from "./fake-calle.server";
export { CallePhoneSupportProvider } from "./calle-provider.server";
