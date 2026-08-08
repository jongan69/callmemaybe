-- Track mandatory Shopify privacy requests without retaining raw webhook IDs or
-- raw customer identifiers. Data exports are encrypted by the application.
CREATE TABLE "PrivacyRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "webhookEventIdHash" TEXT NOT NULL,
    "customerIdHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "exportEncrypted" TEXT,
    "errorMessage" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "expiresAt" DATETIME
);

CREATE UNIQUE INDEX "PrivacyRequest_webhookEventIdHash_key" ON "PrivacyRequest"("webhookEventIdHash");
CREATE INDEX "PrivacyRequest_shopDomain_receivedAt_idx" ON "PrivacyRequest"("shopDomain", "receivedAt");
CREATE INDEX "PrivacyRequest_shopDomain_customerIdHash_idx" ON "PrivacyRequest"("shopDomain", "customerIdHash");
