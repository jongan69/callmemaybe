import prisma from "../app/db.server";
import { REGION_DEFINITIONS, SUPPORTED_LOCALES } from "../app/lib/regions";

const policies = await prisma.regionPolicy.findMany({
  orderBy: { countryCode: "asc" },
});
const expectedCodes = [
  ...REGION_DEFINITIONS.map((region) => region.countryCode),
].sort();
const actualCodes = [
  ...new Set(policies.map((policy) => policy.countryCode)),
].sort();

if (
  policies.length !== REGION_DEFINITIONS.length ||
  JSON.stringify(actualCodes) !== JSON.stringify(expectedCodes)
) {
  throw new Error(
    `Region seed mismatch: expected ${REGION_DEFINITIONS.length} unique policies, found ${policies.length}`,
  );
}
if (
  process.env.DEMO_SEED !== "true" &&
  policies.some((policy) => policy.enabled)
) {
  throw new Error("A normal seed must leave every regional policy disabled");
}
if (SUPPORTED_LOCALES.length !== 12 || new Set(SUPPORTED_LOCALES).size !== 12) {
  throw new Error(
    "The supported locale registry must contain exactly 12 unique languages",
  );
}
for (const policy of policies) {
  const locales = JSON.parse(policy.localesJson) as unknown;
  if (
    !Array.isArray(locales) ||
    locales.length === 0 ||
    locales.some((locale) => !SUPPORTED_LOCALES.includes(locale))
  ) {
    throw new Error(
      `Region ${policy.countryCode} references an unsupported or empty locale set`,
    );
  }
}

console.log(
  `Validated ${policies.length} disabled-by-default regional policies and ${SUPPORTED_LOCALES.length} locale codes.`,
);
await prisma.$disconnect();
