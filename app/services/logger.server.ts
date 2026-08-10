const REDACTED_KEYS =
  /phone|email|address|transcript|token|secret|password|authorization|cookie|api.?key|taskText|structuredResult/i;
const LEVEL_PRIORITY = { debug: 10, info: 20, warn: 30, error: 40 } as const;

function sanitize(value: unknown, key = "", depth = 0): unknown {
  if (REDACTED_KEYS.test(key)) return "[REDACTED]";
  if (depth > 5) return "[TRUNCATED]";
  if (typeof value === "string") {
    return value
      .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
      .replace(/\/webhooks\/calle\/[^/?\s]+/gi, "/webhooks/calle/[REDACTED]")
      .replace(
        /([?&](?:token|nonce|attempt|code|key|secret)=)[^&\s]+/gi,
        "$1[REDACTED]",
      )
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")
      .replace(/\+?\d[\d\s().-]{7,}\d/g, "[PHONE]")
      .slice(0, 1000);
  }
  if (Array.isArray(value))
    return value.map((item) => sanitize(item, key, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(
        ([childKey, childValue]) => [
          childKey,
          sanitize(childValue, childKey, depth + 1),
        ],
      ),
    );
  }
  return value;
}

export function sanitizeTelemetry<T>(value: T): T {
  return sanitize(value) as T;
}

export function logEvent(
  level: "debug" | "info" | "warn" | "error",
  event: string,
  context: Record<string, unknown> = {},
) {
  const configuredLevel = process.env.LOG_LEVEL;
  const minimumLevel =
    configuredLevel && configuredLevel in LEVEL_PRIORITY
      ? (configuredLevel as keyof typeof LEVEL_PRIORITY)
      : process.env.NODE_ENV === "production"
        ? "info"
        : "debug";
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minimumLevel]) return;
  const entry = JSON.stringify(
    sanitizeTelemetry({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...context,
    }),
  );
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.log(entry);
}
