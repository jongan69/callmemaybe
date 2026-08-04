import type { ApplicationError } from "./types";
import { generateRequestId } from "./crypto.server";

export function createError(
  code: string,
  message: string,
  userMessage: string,
  opts: {
    retryable?: boolean;
    fieldErrors?: Record<string, string[]>;
    metadata?: Record<string, unknown>;
  } = {},
): ApplicationError {
  return {
    code,
    message,
    userMessage,
    retryable: opts.retryable ?? false,
    requestId: generateRequestId(),
    fieldErrors: opts.fieldErrors,
    metadata: opts.metadata,
  };
}

export const ErrorCodes = {
  AUTH_INVALID: "AUTH_INVALID",
  CUSTOMER_NOT_AUTHENTICATED: "CUSTOMER_NOT_AUTHENTICATED",
  ORDER_NOT_OWNED: "ORDER_NOT_OWNED",
  ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
  ORDER_NOT_SUPPORTED: "ORDER_NOT_SUPPORTED",
  PHONE_INVALID: "PHONE_INVALID",
  CALL_PLAN_CONTEXT_MISSING: "CALL_PLAN_CONTEXT_MISSING",
  REGION_UNSUPPORTED: "REGION_UNSUPPORTED",
  CALLING_WINDOW_CLOSED: "CALLING_WINDOW_CLOSED",
  CONSENT_REQUIRED: "CONSENT_REQUIRED",
  RATE_LIMITED: "RATE_LIMITED",
  DUPLICATE_CASE: "DUPLICATE_CASE",
  CALL_PROVIDER_DISABLED: "CALL_PROVIDER_DISABLED",
  CALL_CREATE_AMBIGUOUS: "CALL_CREATE_AMBIGUOUS",
  CALL_NOT_TERMINAL: "CALL_NOT_TERMINAL",
  CALL_RESULT_INVALID: "CALL_RESULT_INVALID",
  IDENTITY_NOT_VERIFIED: "IDENTITY_NOT_VERIFIED",
  LOW_CONFIDENCE: "LOW_CONFIDENCE",
  ORDER_STATE_CHANGED: "ORDER_STATE_CHANGED",
  POLICY_BLOCKED: "POLICY_BLOCKED",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  SHOPIFY_MUTATION_FAILED: "SHOPIFY_MUTATION_FAILED",
  SHOPIFY_USER_ERROR: "SHOPIFY_USER_ERROR",
  WEBHOOK_INVALID: "WEBHOOK_INVALID",
  WEBHOOK_DUPLICATE: "WEBHOOK_DUPLICATE",
  OUTCOME_UNKNOWN: "OUTCOME_UNKNOWN",
  SHOP_NOT_FOUND: "SHOP_NOT_FOUND",
  CASE_NOT_FOUND: "CASE_NOT_FOUND",
} as const;

export function isApplicationError(error: unknown): error is ApplicationError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "userMessage" in error &&
    "requestId" in error
  );
}

export function errorToResponse(error: ApplicationError): {
  error: ApplicationError;
} {
  return { error };
}
