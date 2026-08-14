import { execFileSync } from "node:child_process";

const raw = execFileSync("bun", ["audit", "--json", "--audit-level=high"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
});
const findings = JSON.parse(raw);
const vulnerablePackages = Object.keys(findings);

if (vulnerablePackages.length > 0) {
  console.error(
    `High-severity dependency audit failed: ${vulnerablePackages.join(", ")}`,
  );
  process.exit(1);
}

console.log("No high-severity dependency vulnerabilities found.");
