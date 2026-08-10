import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";

const tracked = execFileSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter((file) => Boolean(file) && existsSync(file));
const forbiddenArtifacts = tracked.filter(
  (file) =>
    [".sqlite", ".sqlite3", ".db"].includes(extname(file).toLowerCase()) ||
    /^extensions\/[^/]+\/manifest\.json$/.test(file),
);
if (forbiddenArtifacts.length > 0) {
  throw new Error(
    `Forbidden generated/database artifacts are tracked: ${forbiddenArtifacts.join(", ")}`,
  );
}

const textFiles = tracked.filter(
  (file) => !/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|pdf|zip)$/i.test(file),
);
const forbiddenPatterns: Array<[RegExp, string]> = [
  [/CALL_PROVIDER\s*=\s*f[a]ke\b/i, "obsolete fixture provider assignment"],
  [/sk_(?:live|test)_[A-Za-z0-9]{20,}/, "Stripe-style secret"],
  [/gh[oprsu]_[A-Za-z0-9_]{30,}/, "GitHub token"],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key"],
];
const findings: string[] = [];
for (const file of textFiles) {
  const content = readFileSync(file, "utf8");
  if (
    /^(?:shopify\..*\.toml|\.env\.example)$/.test(file) &&
    /\bread_customers\b/.test(content)
  ) {
    findings.push(`${file}: unapproved read_customers scope`);
  }
  for (const [pattern, label] of forbiddenPatterns) {
    if (pattern.test(content)) findings.push(`${file}: ${label}`);
  }
}
if (findings.length > 0)
  throw new Error(`Repository policy check failed:\n${findings.join("\n")}`);

console.log(
  `Validated ${tracked.length} repository files: no database/manifest artifacts or forbidden configuration/secret patterns.`,
);
