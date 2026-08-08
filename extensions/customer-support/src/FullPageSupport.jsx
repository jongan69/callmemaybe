import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useSessionToken, useOrder } from "@shopify/ui-extensions/preact";

const API_BASE = "";

const ISSUE_OPTIONS = [
  { value: "ORDER_STATUS", label: "Track my order" },
  { value: "ADDRESS_CHANGE", label: "Change address" },
  { value: "CANCELLATION", label: "Cancel order" },
  { value: "RETURN", label: "Return item" },
  { value: "DAMAGED_ITEM", label: "Damaged item" },
  { value: "WRONG_ITEM", label: "Wrong item" },
  { value: "MISSING_ITEM", label: "Missing item" },
  { value: "PRODUCT_HELP", label: "Product help" },
  { value: "OTHER", label: "Something else" },
];

const CONSENT_TEXT =
  "I am requesting an automated AI support call about this order. I understand the call may be transcribed or recorded as described by the store.";

export default async () => {
  render(<FullPageSupport />, document.body);
};

function FullPageSupport() {
  const token = useSessionToken();
  const order = useOrder();

  const [step, setStep] = useState("request"); // request | preparing | active | result
  const [issueType, setIssueType] = useState("");
  const [consented, setConsented] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [caseRef, setCaseRef] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeExpiresAt, setCodeExpiresAt] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [caseStatus, setCaseStatus] = useState("");
  const pollTimerRef = useRef(null);

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  useEffect(() => () => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
  }, []);

  const requestSupport = async () => {
    if (!issueType) {
      setError("Please select what you need help with.");
      return;
    }
    if (!consented) {
      setError("Please consent to receive an AI support call.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/customer-support/request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orderId: order.id,
          orderName: order.name || `#${order.number}`,
          issueType,
          consentGiven: true,
        }),
      });

      const data = await res.json();

      if (res.ok && data.caseReference) {
        setCaseRef(data.caseReference);
        setVerificationCode(data.verificationCode);
        setCodeExpiresAt(data.codeExpiresAt);
        setMaskedPhone(data.maskedPhone);
        setStep("preparing");
        startPolling(data.caseReference);
      } else {
        setError(
          data.error?.userMessage ||
          data.error?.message ||
          "Unable to create support case. Please try again.",
        );
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const startPolling = (reference) => {
    stopPolling();
    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/customer-support/cases/${reference}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.case) {
            setCaseStatus(data.case.status);
            if (
              data.case.status === "RESOLVED" ||
              data.case.status === "AWAITING_APPROVAL" ||
              data.case.status === "NEEDS_HUMAN" ||
              data.case.status === "FAILED" ||
              data.case.status === "CALL_NOT_COMPLETED" ||
              data.case.status === "CANCELED"
            ) {
              setStep("result");
              stopPolling();
            } else if (data.case.callStatus === "CALLING") {
              setStep("active");
            }
          }
        }
      } catch {
        // Polling errors are not user-facing
      }
    }, 3000);
  };

  const resetForm = () => {
    stopPolling();
    setStep("request");
    setIssueType("");
    setConsented(false);
    setError("");
    setCaseRef("");
    setVerificationCode("");
    setCodeExpiresAt("");
    setMaskedPhone("");
    setCaseStatus("");
  };

  // ─── Request Screen ──────────────────────────────────────────

  if (step === "request") {
    return (
      <s-page heading="Get Support">
        <s-section heading={`Order ${order?.name || `#${order?.number}`}`}>
          <s-text>
            Request an AI phone call to help with your order. The agent already
            knows your order details and will verify your identity before
            discussing anything.
          </s-text>
        </s-section>

        <s-section heading="What do you need help with?">
          <s-stack direction="block" gap="base">
            {ISSUE_OPTIONS.map((opt) => (
              <s-box
                key={opt.value}
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background={issueType === opt.value ? "subdued" : undefined}
                onClick={() => setIssueType(opt.value)}
              >
                <s-text>{opt.label}</s-text>
              </s-box>
            ))}
          </s-stack>
        </s-section>

        <s-section heading="Consent">
          <s-stack direction="inline" gap="base">
            <input
              type="checkbox"
              id="consent"
              checked={consented}
              onChange={(e) => setConsented(e.currentTarget.checked)}
            />
            <label htmlFor="consent">
              <s-text>{CONSENT_TEXT}</s-text>
            </label>
          </s-stack>
        </s-section>

        {error && (
          <s-banner tone="critical">
            <s-text>{error}</s-text>
          </s-banner>
        )}

        <s-stack direction="inline" gap="base">
          <button
            type="button"
            onClick={requestSupport}
            disabled={loading || !issueType || !consented}
          >
            {loading ? "Preparing..." : "Call me"}
          </button>
        </s-stack>

        <s-section heading="Important">
          <s-text>
            This is an AI-operated support call. Refunds and cancellations may
            require store approval.
          </s-text>
        </s-section>
      </s-page>
    );
  }

  // ─── Preparing Screen ─────────────────────────────────────────

  if (step === "preparing") {
    return (
      <s-page heading="Your Support Call">
        <s-section heading="Call being prepared">
          <s-banner tone="success">
            <s-text>
              Your support call is being prepared. You will receive a call
              shortly at {maskedPhone}.
            </s-text>
          </s-banner>
        </s-section>

        <s-section heading="Verification code">
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-text>
              When the AI agent calls, give them this code:
            </s-text>
            <s-heading>{verificationCode}</s-heading>
            <s-text>
              Code expires at{" "}
              {new Date(codeExpiresAt).toLocaleTimeString()}
            </s-text>
            <s-text>
              Never share this code with anyone who calls you unexpectedly.
            </s-text>
          </s-box>
        </s-section>

        <s-section heading="Case reference">
          <s-text>{caseRef}</s-text>
        </s-section>

        <s-stack direction="inline" gap="base">
          <button type="button" onClick={resetForm}>
            Cancel request
          </button>
        </s-stack>
      </s-page>
    );
  }

  // ─── Active Screen ────────────────────────────────────────────

  if (step === "active") {
    return (
      <s-page heading="Call in Progress">
        <s-section heading="Your support call is active">
          <s-banner tone="info">
            <s-text>
              The AI agent is currently on the phone. Please stay on the line.
            </s-text>
          </s-banner>
        </s-section>
        <s-section heading="Case reference">
          <s-text>{caseRef}</s-text>
        </s-section>
      </s-page>
    );
  }

  // ─── Result Screen ────────────────────────────────────────────

  const resultLabels = {
    RESOLVED: { tone: "success", text: "Your support request has been resolved." },
    AWAITING_APPROVAL: { tone: "info", text: "Your request is awaiting store approval." },
    NEEDS_HUMAN: { tone: "warning", text: "Your case has been escalated for human review." },
    CALL_NOT_COMPLETED: { tone: "warning", text: "The call could not be completed. You can request another." },
    FAILED: { tone: "critical", text: "There was an issue. Please try again." },
  };

  const result = resultLabels[caseStatus] || {
    tone: "info",
    text: `Case status: ${caseStatus}`,
  };

  return (
    <s-page heading="Support Result">
      <s-section heading="Status">
        <s-banner tone={result.tone}>
          <s-text>{result.text}</s-text>
        </s-banner>
      </s-section>
      <s-section heading="Case reference">
        <s-text>{caseRef}</s-text>
      </s-section>
      {(caseStatus === "CALL_NOT_COMPLETED" || caseStatus === "FAILED") && (
        <s-stack direction="inline" gap="base">
          <button type="button" onClick={resetForm}>
            Request another call
          </button>
        </s-stack>
      )}
    </s-page>
  );
}
