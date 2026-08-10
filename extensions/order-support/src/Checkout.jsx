import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

export default async function extension() {
  render(<Extension />, document.body);
}

function Extension() {
  const order = shopify.orderConfirmation.value;
  const locale = shopify.localization.extensionLanguage.value.isoCode;
  const [consented, setConsented] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [consentCopy, setConsentCopy] = useState("");
  const orderId = order?.id;

  useEffect(() => {
    if (!orderId) return undefined;
    let active = true;
    const loadConsentCopy = async () => {
      try {
        // Session tokens expire quickly, so retrieve one immediately before the request.
        const token = await shopify.sessionToken.get();
        const response = await fetch(
          `/api/checkout-support/consent?orderId=${encodeURIComponent(orderId)}&locale=${encodeURIComponent(locale)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!response.ok) throw new Error("Consent terms unavailable");
        const body = await response.json();
        if (!body.text) throw new Error("Consent terms unavailable");
        if (active) setConsentCopy(body.text);
      } catch {
        if (active) setError(shopify.i18n.translate("error"));
      }
    };
    void loadConsentCopy();
    return () => {
      active = false;
    };
  }, [locale, orderId]);

  if (!order) return null;

  const saveConsent = async () => {
    setSaving(true);
    setError("");
    try {
      const token = await shopify.sessionToken.get();
      const response = await fetch("/api/checkout-support/consent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderId: order.id, intent: "grant", locale }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Unable to save consent");
      }
      setSaved(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : shopify.i18n.translate("error"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <s-section heading={shopify.i18n.translate("heading")}>
      <s-stack direction="block" gap="base">
        <s-text>{shopify.i18n.translate("body")}</s-text>
        <s-checkbox
          checked={consented}
          disabled={saved || !consentCopy}
          label={consentCopy || shopify.i18n.translate("consentText")}
          onChange={() => setConsented(!consented)}
        />
        {error && (
          <s-banner tone="critical">
            <s-text>{error}</s-text>
          </s-banner>
        )}
        {saved ? (
          <s-banner tone="success">
            <s-text>{shopify.i18n.translate("saved")}</s-text>
          </s-banner>
        ) : (
          <s-button
            onClick={saveConsent}
            disabled={!consented || saving || !consentCopy}
          >
            {saving
              ? shopify.i18n.translate("saving")
              : shopify.i18n.translate("save")}
          </s-button>
        )}
      </s-stack>
    </s-section>
  );
}
