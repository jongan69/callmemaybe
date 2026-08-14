import { spawnSync } from "node:child_process";

const audit = spawnSync("bun", ["audit", "--json", "--audit-level=high"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
if (audit.error) throw audit.error;
if (audit.stderr) process.stderr.write(audit.stderr);

const findings = JSON.parse(audit.stdout || "{}");
const vulnerablePackages = Object.keys(findings);

if (vulnerablePackages.length > 0) {
  console.error(
    `High-severity dependency audit failed: ${vulnerablePackages.join(", ")}`,
  );
  process.exit(1);
}

if (audit.status !== 0) {
  console.error(
    `Dependency audit exited with status ${audit.status ?? "unknown"}.`,
  );
  process.exit(audit.status ?? 1);
}

console.log("No high-severity dependency vulnerabilities found.");
