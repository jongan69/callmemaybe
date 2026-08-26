import { spawn } from "node:child_process";
import process from "node:process";

export function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      env: process.env,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(
          new Error(`Node command terminated by ${signal}: ${args.join(" ")}`),
        );
        return;
      }

      if (code !== 0) {
        reject(
          new Error(`Node command exited with ${code}: ${args.join(" ")}`),
        );
        return;
      }

      resolve();
    });
  });
}

export async function runProductionSetup() {
  await runNode(["node_modules/prisma/build/index.js", "migrate", "deploy"]);
  await runNode([
    "--env-file-if-exists=.env",
    "--import",
    "tsx",
    "prisma/seed.ts",
  ]);
  await runNode([
    "--env-file-if-exists=.env",
    "--import",
    "tsx",
    "scripts/initialize-queue.ts",
  ]);
}

export function runLongLivedNode(args) {
  const child = spawn(process.execPath, args, {
    env: process.env,
    stdio: "inherit",
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => child.kill(signal));
  }

  child.once("error", (error) => {
    throw error;
  });
  child.once("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exitCode = code ?? 1;
  });

  return child;
}
