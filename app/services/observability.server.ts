import * as Sentry from "@sentry/node";
import { sanitizeTelemetry } from "./logger.server";

let initialized = false;

export function sanitizeRequestUrl(
  value: string | undefined,
): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const pathname = url.pathname.replace(
      /^\/webhooks\/calle\/[^/]+/,
      "/webhooks/calle/[REDACTED]",
    );
    return `${url.origin}${pathname}`;
  } catch {
    return undefined;
  }
}

export function initializeObservability() {
  if (initialized) return;
  initialized = true;
  Sentry.init({
    dsn: process.env.SENTRY_DSN || undefined,
    environment: process.env.RENDER_SERVICE_NAME
      ? process.env.NODE_ENV
      : `local-${process.env.NODE_ENV || "development"}`,
    release: process.env.RENDER_GIT_COMMIT || undefined,
    sendDefaultPii: false,
    beforeSend(event) {
      return sanitizeTelemetry({
        ...event,
        message: event.message ? "[REDACTED]" : undefined,
        exception: event.exception
          ? {
              ...event.exception,
              values: event.exception.values?.map((value) => ({
                ...value,
                value: value.value ? "[REDACTED]" : undefined,
              })),
            }
          : undefined,
        breadcrumbs: undefined,
        user: undefined,
        request: event.request
          ? {
              method: event.request.method,
              url: sanitizeRequestUrl(event.request.url),
            }
          : undefined,
      });
    },
  });
}

export function captureOperationalError(
  error: unknown,
  context: Record<string, unknown> = {},
) {
  Sentry.captureException(error, { extra: sanitizeTelemetry(context) });
}
