import { spawnSync } from "node:child_process";

const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  executable,
  ["shopify", "app", "build", "--no-color"],
  {
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", CI: process.env.CI || "true" },
  },
);
const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
process.stdout.write(output);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (/(?:^|\n)\s*(?:warning:|warn\b|╭─\s*warning)/i.test(output)) {
  throw new Error(
    "Shopify extension build emitted a warning; warnings are release-blocking",
  );
}
