import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

/** @type {Array<[string, string]>} */
const ISSUE_OPTIONS = [
  ["ORDER_STATUS", "issueOrderStatus"],
  ["ADDRESS_CHANGE", "issueAddressChange"],
  ["CANCELLATION", "issueCancellation"],
  ["RETURN", "issueReturn"],
  ["DAMAGED_ITEM", "issueDamaged"],
  ["WRONG_ITEM", "issueWrong"],
  ["MISSING_ITEM", "issueMissing"],
  ["PRODUCT_HELP", "issueProduct"],
  ["OTHER", "issueOther"],
];

export default async function extension() {
  render(<FullPageSupport />, document.body);
}

function FullPageSupport() {
  const orderId = shopify.orderId;
  /**
   * @param {string} key
   * @param {Record<string, string | number>} [values]
   */
  const t = (key, values = {}) => shopify.i18n.translate(key, values);
  const locale = shopify.localization.extensionLanguage.value.isoCode;
  const [step, setStep] = useState("request");
  const [issueType, setIssueType] = useState("");
  const [consented, setConsented] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [caseRef, setCaseRef] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeExpiresAt, setCodeExpiresAt] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [caseStatus, setCaseStatus] = useState("");
  const [consentCopy, setConsentCopy] = useState("");
  const pollTimerRef = useRef(
    /** @type {ReturnType<typeof setInterval> | null} */ (null),
  );

  /**
   * @param {string} path
   * @param {RequestInit} [init]
   */
  const authenticatedFetch = useCallback(async (path, init) => {
    const token = await shopify.sessionToken.get();
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(path, {
      ...init,
      headers,
    });
  }, []);

  /** @returns {void} */
  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  /**
   * @param {string} reference
   * @returns {void}
   */
  const startPolling = useCallback(
    (reference) => {
      stopPolling();
      pollTimerRef.current = setInterval(async () => {
        try {
          const response = await authenticatedFetch(
            `/api/customer-support/cases/${encodeURIComponent(reference)}`,
            {},
          );
          if (!response.ok) return;
          const body = await response.json();
          if (!body.case) return;
          setCaseStatus(body.case.status);
          if (body.case.verificationCode) {
            setVerificationCode(body.case.verificationCode);
            setCodeExpiresAt(body.case.codeExpiresAt);
          }
          if (
            [
              "RESOLVED",
              "AWAITING_APPROVAL",
              "NEEDS_HUMAN",
              "FAILED",
              "CALL_NOT_COMPLETED",
              "CANCELED",
            ].includes(body.case.status)
          ) {
            setStep("result");
            stopPolling();
          } else if (
            ["CALLING", "PROCESSING_RESULT"].includes(body.case.status)
          ) {
            setStep("active");
          }
        } catch {
          // A later poll reconciles transient network failures.
        }
      }, 3000);
    },
    [authenticatedFetch, stopPolling],
  );

  useEffect(() => {
    if (!orderId) return undefined;
    let active = true;
    const loadExistingState = async () => {
      try {
        const consentResponse = await authenticatedFetch(
          `/api/customer-support/consent?orderId=${encodeURIComponent(orderId)}&locale=${encodeURIComponent(locale)}`,
          {},
        );
        if (!consentResponse.ok) throw new Error("Consent terms unavailable");
        const body = await consentResponse.json();
        if (!body.text) throw new Error("Consent terms unavailable");
        if (active) {
          setConsented(body.consent?.active === true);
          setConsentCopy(body.text);
        }
      } catch {
        if (active) setError(shopify.i18n.translate("errorGeneric", {}));
      }
      try {
        const caseResponse = await authenticatedFetch(
          `/api/customer-support/cases/latest?orderId=${encodeURIComponent(orderId)}`,
          {},
        );
        const body = await caseResponse.json();
        if (!active || !body.case) return;
        setCaseRef(body.case.reference);
        setCaseStatus(body.case.status);
        if (body.case.verificationCode) {
          setVerificationCode(body.case.verificationCode);
          setCodeExpiresAt(body.case.codeExpiresAt);
          setStep("preparing");
        } else if (
          ["CALLING", "PROCESSING_RESULT"].includes(body.case.status)
        ) {
          setStep("active");
        } else if (
          [
            "RESOLVED",
            "AWAITING_APPROVAL",
            "NEEDS_HUMAN",
            "FAILED",
            "CALL_NOT_COMPLETED",
            "CANCELED",
          ].includes(body.case.status)
        ) {
          setStep("result");
        }
        startPolling(body.case.reference);
      } catch {
        // The buyer can still submit a new support request.
      }
    };
    void loadExistingState();
    return () => {
      active = false;
      stopPolling();
    };
  }, [authenticatedFetch, locale, orderId, startPolling, stopPolling]);

  const requestSupport = async () => {
    if (!issueType || !consented) {
      setError(t(!issueType ? "errorIssue" : "errorConsent"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await authenticatedFetch(
        "/api/customer-support/request",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId,
            issueType,
            locale,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok || !body.caseReference) {
        setError(
          body.error?.userMessage || body.error?.message || t("errorGeneric"),
        );
        return;
      }
      setCaseRef(body.caseReference);
      setVerificationCode(body.verificationCode);
      setCodeExpiresAt(body.codeExpiresAt);
      setMaskedPhone(body.maskedPhone);
      setStep("preparing");
      startPolling(body.caseReference);
    } catch {
      setError(t("errorNetwork"));
    } finally {
      setLoading(false);
    }
  };

  const revokeConsent = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await authenticatedFetch(
        "/api/customer-support/consent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, intent: "revoke", locale }),
        },
      );
      if (!response.ok) throw new Error("revoke failed");
      setConsented(false);
      shopify.toast.show(t("consentRevoked"));
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  /** @param {boolean} nextValue */
  const updateConsent = async (nextValue) => {
    if (!consentCopy) {
      setError(t("errorGeneric"));
      return;
    }
    if (!nextValue) {
      await revokeConsent();
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await authenticatedFetch(
        "/api/customer-support/consent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, intent: "grant", locale }),
        },
      );
      if (!response.ok) throw new Error("grant failed");
      setConsented(true);
      shopify.toast.show(t("consentSaved"));
    } catch {
      setConsented(false);
      setError(t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  if (!orderId) {
    return (
      <s-customer-account-action heading={t("heading")}>
        <s-spinner size="base" />
      </s-customer-account-action>
    );
  }

  if (step === "request") {
    return (
      <s-customer-account-action heading={t("heading")}>
        <s-section heading={t("aboutHeading")}>
          <s-text>{t("intro")}</s-text>
        </s-section>
        <s-section heading={t("issueHeading")}>
          <s-stack direction="block" gap="base">
            {ISSUE_OPTIONS.map(([value, key]) => (
              <s-button
                key={value}
                variant={issueType === value ? "primary" : "secondary"}
                onClick={() => setIssueType(value)}
              >
                {t(key)}
              </s-button>
            ))}
          </s-stack>
        </s-section>
        <s-section heading={t("consentHeading")}>
          <s-checkbox
            checked={consented}
            disabled={loading || !consentCopy}
            label={consentCopy || t("consentText")}
            onChange={() => void updateConsent(!consented)}
          />
          {consented && (
            <s-button
              variant="secondary"
              onClick={revokeConsent}
              disabled={loading}
            >
              {t("revokeConsent")}
            </s-button>
          )}
        </s-section>
        {error && (
          <s-banner tone="critical">
            <s-text>{error}</s-text>
          </s-banner>
        )}
        <s-button
          slot="primary-action"
          onClick={requestSupport}
          disabled={loading || !issueType || !consented || !consentCopy}
        >
          {loading ? t("preparing") : t("callMe")}
        </s-button>
        <s-button slot="secondary-actions" onClick={() => shopify.close()}>
          {t("close")}
        </s-button>
      </s-customer-account-action>
    );
  }

  if (step === "preparing") {
    return (
      <s-customer-account-action heading={t("callHeading")}>
        <s-banner tone="success">
          <s-text>{t("callPrepared", { phone: maskedPhone })}</s-text>
        </s-banner>
        <s-section heading={t("verificationHeading")}>
          <s-heading>{verificationCode}</s-heading>
          <s-text>{t("verificationHelp")}</s-text>
          <s-text>
            {t("expires", {
              time: new Date(codeExpiresAt).toLocaleTimeString(locale),
            })}
          </s-text>
        </s-section>
        <s-section heading={t("caseReference")}>
          <s-text>{caseRef}</s-text>
        </s-section>
        <s-button slot="secondary-actions" onClick={() => shopify.close()}>
          {t("close")}
        </s-button>
      </s-customer-account-action>
    );
  }

  if (step === "active") {
    return (
      <s-customer-account-action heading={t("callHeading")}>
        <s-banner tone="info">
          <s-text>{t("callActive")}</s-text>
        </s-banner>
        <s-section heading={t("caseReference")}>
          <s-text>{caseRef}</s-text>
        </s-section>
        <s-button slot="secondary-actions" onClick={() => shopify.close()}>
          {t("close")}
        </s-button>
      </s-customer-account-action>
    );
  }

  return (
    <s-customer-account-action heading={t("resultHeading")}>
      <s-banner tone={caseStatus === "RESOLVED" ? "success" : "info"}>
        <s-text>
          {t(caseStatus === "RESOLVED" ? "statusResolved" : "statusReview")}
        </s-text>
      </s-banner>
      <s-section heading={t("caseReference")}>
        <s-text>{caseRef}</s-text>
      </s-section>
      <s-button slot="primary-action" onClick={() => shopify.close()}>
        {t("close")}
      </s-button>
    </s-customer-account-action>
  );
}
