export function publicConfiguration() {
  return {
    legalVersion:
      process.env.LEGAL_DOCUMENT_VERSION || "pending legal approval",
    supportEmail: process.env.PUBLIC_SUPPORT_EMAIL || "support@example.invalid",
    securityEmail:
      process.env.PUBLIC_SECURITY_EMAIL || "security@example.invalid",
    statusUrl: process.env.PUBLIC_STATUS_URL || null,
  };
}
