-- CreateTable
CREATE TABLE "ShopSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "shopifyShopId" TEXT NOT NULL,
    "storeName" TEXT NOT NULL DEFAULT 'My Store',
    "supportDepartmentName" TEXT NOT NULL DEFAULT 'Support',
    "agentName" TEXT NOT NULL DEFAULT 'Riley',
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "defaultLocale" TEXT NOT NULL DEFAULT 'en-US',
    "supportHoursJson" TEXT NOT NULL DEFAULT '{"start":"08:00","end":"20:00","timezone":"America/New_York"}',
    "humanEscalationEmail" TEXT,
    "humanEscalationPhoneEncrypted" TEXT,
    "callProviderMode" TEXT NOT NULL DEFAULT 'fake',
    "realCallsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "confidenceThreshold" REAL NOT NULL DEFAULT 0.85,
    "maxCallsPerCustomerPerDay" INTEGER NOT NULL DEFAULT 2,
    "transcriptRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SupportPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "mode" TEXT NOT NULL DEFAULT 'APPROVAL',
    "conditionsJson" TEXT NOT NULL DEFAULT '{}',
    "customInstructions" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SupportPolicy_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "ShopSettings" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgeSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "normalizedContent" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "appliesToJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "sourceUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KnowledgeSource_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "ShopSettings" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupportCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicReference" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyOrderName" TEXT NOT NULL,
    "shopifyCustomerId" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "customerIssueSummary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "resolutionMode" TEXT,
    "riskLevel" TEXT,
    "customerNameEncrypted" TEXT,
    "customerEmailEncrypted" TEXT,
    "customerPhoneEncrypted" TEXT,
    "customerPhoneHash" TEXT,
    "customerPhoneLastFour" TEXT,
    "orderSnapshotJson" TEXT,
    "orderSnapshotHash" TEXT,
    "knowledgeSnapshotJson" TEXT,
    "policySnapshotJson" TEXT,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SupportCase_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "ShopSettings" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CallbackConsent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supportCaseId" TEXT NOT NULL,
    "consentTextVersion" TEXT NOT NULL,
    "consentText" TEXT NOT NULL,
    "phoneHash" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sessionTokenSubjectHash" TEXT,
    "ipHash" TEXT,
    "userAgentSummary" TEXT,
    "consentedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    CONSTRAINT "CallbackConsent_supportCaseId_fkey" FOREIGN KEY ("supportCaseId") REFERENCES "SupportCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VerificationChallenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supportCaseId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "maxAttempts" INTEGER NOT NULL DEFAULT 2,
    "attemptsUsed" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" DATETIME,
    "invalidatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VerificationChallenge_supportCaseId_fkey" FOREIGN KEY ("supportCaseId") REFERENCES "SupportCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CallPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supportCaseId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "taskTextEncrypted" TEXT NOT NULL,
    "resultSchemaJson" TEXT NOT NULL,
    "recipientResultSchemaJson" TEXT,
    "metadataJson" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CallPlan_supportCaseId_fkey" FOREIGN KEY ("supportCaseId") REFERENCES "SupportCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CallAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supportCaseId" TEXT NOT NULL,
    "callPlanId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'calle',
    "providerCallId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "outcome" TEXT,
    "taskCompleted" BOOLEAN,
    "completionConfidenceScore" REAL,
    "completionConfidenceLabel" TEXT,
    "structuredResultJson" TEXT,
    "summary" TEXT,
    "evidenceJson" TEXT,
    "transcriptEncrypted" TEXT,
    "transcriptRedacted" TEXT,
    "providerResponseSanitizedJson" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" DATETIME,
    "connectedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CallAttempt_supportCaseId_fkey" FOREIGN KEY ("supportCaseId") REFERENCES "SupportCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CallAttempt_callPlanId_fkey" FOREIGN KEY ("callPlanId") REFERENCES "CallPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CallEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "callAttemptId" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventTime" DATETIME NOT NULL,
    "sequence" INTEGER NOT NULL,
    "sanitizedPayloadJson" TEXT,
    "payloadHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CallEvent_callAttemptId_fkey" FOREIGN KEY ("callAttemptId") REFERENCES "CallAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ResolutionProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supportCaseId" TEXT NOT NULL,
    "callAttemptId" TEXT,
    "actionType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "riskLevel" TEXT,
    "policyDecisionJson" TEXT,
    "proposedInputJson" TEXT,
    "beforeStateJson" TEXT,
    "financialImpactJson" TEXT,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "rejectedBy" TEXT,
    "rejectedAt" DATETIME,
    "rejectionReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ResolutionProposal_supportCaseId_fkey" FOREIGN KEY ("supportCaseId") REFERENCES "SupportCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ResolutionExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resolutionProposalId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "shopifyMutation" TEXT,
    "requestJson" TEXT,
    "responseJson" TEXT,
    "userErrorsJson" TEXT,
    "beforeStateJson" TEXT,
    "afterStateJson" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResolutionExecution_resolutionProposalId_fkey" FOREIGN KEY ("resolutionProposalId") REFERENCES "ResolutionProposal" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebhookReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "externalEventId" TEXT,
    "payloadHash" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL DEFAULT false,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processingError" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "supportCaseId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "requestId" TEXT NOT NULL,
    "beforeHash" TEXT,
    "afterHash" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_supportCaseId_fkey" FOREIGN KEY ("supportCaseId") REFERENCES "SupportCase" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UsageLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "supportCaseId" TEXT,
    "callAttemptId" TEXT,
    "usageType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'call',
    "estimatedCostMinor" INTEGER,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopSettings_shopDomain_key" ON "ShopSettings"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "SupportPolicy_shopId_issueType_key" ON "SupportPolicy"("shopId", "issueType");

-- CreateIndex
CREATE UNIQUE INDEX "SupportCase_publicReference_key" ON "SupportCase"("publicReference");

-- CreateIndex
CREATE UNIQUE INDEX "CallbackConsent_supportCaseId_key" ON "CallbackConsent"("supportCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationChallenge_supportCaseId_key" ON "VerificationChallenge"("supportCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "CallPlan_idempotencyKey_key" ON "CallPlan"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "CallEvent_callAttemptId_providerEventId_key" ON "CallEvent"("callAttemptId", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "ResolutionExecution_idempotencyKey_key" ON "ResolutionExecution"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookReceipt_provider_payloadHash_key" ON "WebhookReceipt"("provider", "payloadHash");
