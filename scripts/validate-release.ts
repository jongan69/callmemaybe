import { validateReleaseConfiguration } from "../app/services/config.server";

const target = validateReleaseConfiguration();
console.log(`[CallMeMaybe] ${target} release configuration validated.`);
