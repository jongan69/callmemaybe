import {
  runLongLivedNode,
  runNode,
  runProductionSetup,
} from "./container-commands.mjs";

await runProductionSetup();
await runNode(["--import", "tsx", "scripts/validate-runtime.ts"]);
runLongLivedNode([
  "node_modules/@react-router/serve/bin.js",
  "./build/server/index.js",
]);
