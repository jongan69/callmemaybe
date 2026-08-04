-- Add third-party call targets to CallPlan.
-- A CallPlan leg can dial the case customer (default) or a carrier/supplier.
ALTER TABLE "CallPlan" ADD COLUMN "recipientKind" TEXT NOT NULL DEFAULT 'CUSTOMER';
ALTER TABLE "CallPlan" ADD COLUMN "recipientPhoneEncrypted" TEXT;
ALTER TABLE "CallPlan" ADD COLUMN "recipientLabel" TEXT;

-- Orders that cannot ship and whose customer has stopped answering email.
CREATE TABLE "StuckOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyOrderName" TEXT NOT NULL,
    "shopifyCustomerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "blockerDescription" TEXT NOT NULL,
    "emailAttempts" INTEGER NOT NULL DEFAULT 0,
    "valueMinor" INTEGER NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "carrierName" TEXT,
    "carrierSupportPhone" TEXT,
    "trackingNumber" TEXT,
    "shipDate" TEXT,
    "deliveryClaimDate" TEXT,
    "shipToSummary" TEXT,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME
);

CREATE UNIQUE INDEX "StuckOrder_shopId_shopifyOrderId_key" ON "StuckOrder"("shopId", "shopifyOrderId");
