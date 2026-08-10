import { startQueue, stopQueue } from "../app/queue.server";
import { validateRuntimeConfiguration } from "../app/services/config.server";

validateRuntimeConfiguration();
await startQueue();
await stopQueue();
console.log("Initialized PostgreSQL job queues.");
