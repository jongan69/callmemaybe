import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("runtime setup reuses the Prisma client built into the image", async () => {
  const [dockerfile, setup] = await Promise.all([
    readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
    readFile(
      new URL("../scripts/container-commands.mjs", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(dockerfile, /RUN bunx prisma generate && bun run build/);
  assert.doesNotMatch(
    setup,
    /runNode\(\["node_modules\/prisma\/build\/index\.js", "generate"\]\)/,
  );
});
