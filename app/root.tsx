import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  type MiddlewareFunction,
} from "react-router";
import { logEvent } from "./services/logger.server";

const requestLoggingMiddleware: MiddlewareFunction<Response> = async (
  { request },
  next,
) => {
  const suppliedRequestId = request.headers.get("x-request-id") ?? "";
  const requestId = /^[A-Za-z0-9_-]{8,80}$/.test(suppliedRequestId)
    ? suppliedRequestId
    : crypto.randomUUID();
  const startedAt = performance.now();
  const pathname = new URL(request.url).pathname.replace(
    /^\/webhooks\/calle\/[^/]+/,
    "/webhooks/calle/[REDACTED]",
  );
  try {
    const response = await next();
    response.headers.set("x-request-id", requestId);
    logEvent("info", "http.request_completed", {
      requestId,
      method: request.method,
      pathname,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return response;
  } catch (error) {
    logEvent("error", "http.request_failed", {
      requestId,
      method: request.method,
      pathname,
      durationMs: Math.round(performance.now() - startedAt),
    });
    throw error;
  }
};

export const middleware = [requestLoggingMiddleware];

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
