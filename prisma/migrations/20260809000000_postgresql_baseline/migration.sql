-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopSettings" (
    "id" TEXT NOT NULL,
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
    "globalCallingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "enabledRegionsJson" TEXT NOT NULL DEFAULT '[]',
    "businessIdentity" TEXT,
    "termsAcceptedAt" TIMESTAMP(3),
    "termsVersion" TEXT,
    "confidenceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "maxCallsPerCustomerPerDay" INTEGER NOT NULL DEFAULT 2,
    "maxConcurrentCalls" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportPolicy" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "mode" TEXT NOT NULL DEFAULT 'APPROVAL',
    "conditionsJson" TEXT NOT NULL DEFAULT '{}',
    "customInstructions" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeSource" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "normalizedContent" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "appliesToJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "sourceUpdatedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportCase" (
    "id" TEXT NOT NULL,
    "publicReference" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "consentId" TEXT,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyOrderName" TEXT NOT NULL,
    "shopifyCustomerId" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "customerIssueSummary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "resolutionMode" TEXT,
    "riskLevel" TEXT,
    "customerNameEncrypted" TEXT,
    "customerPhoneEncrypted" TEXT,
    "customerPhoneHash" TEXT,
    "customerPhoneLastFour" TEXT,
    "orderSnapshotJson" TEXT,
    "orderSnapshotHash" TEXT,
    "knowledgeSnapshotJson" TEXT,
    "policySnapshotJson" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestExpiresAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallConsent" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyCustomerId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "consentTextVersion" TEXT NOT NULL,
    "consentText" TEXT NOT NULL,
    "phoneHash" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "maxAttempts" INTEGER NOT NULL DEFAULT 2,
    "sessionTokenSubjectHash" TEXT,
    "ipHash" TEXT,
    "userAgentSummary" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revocationReason" TEXT,

    CONSTRAINT "CallConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuppressionEntry" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "shopId" TEXT,
    "phoneHash" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuppressionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegionPolicy" (
    "id" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "countryName" TEXT NOT NULL,
    "callingCode" TEXT NOT NULL,
    "timezoneStrategy" TEXT NOT NULL DEFAULT 'disabled',
    "localesJson" TEXT NOT NULL,
    "permittedPurposesJson" TEXT NOT NULL,
    "callWindowStart" TEXT NOT NULL DEFAULT '09:00',
    "callWindowEnd" TEXT NOT NULL DEFAULT '20:00',
    "consentTextVersion" TEXT NOT NULL DEFAULT '1.0',
    "callScriptVersion" TEXT NOT NULL DEFAULT '1.0',
    "aiDisclosureText" TEXT NOT NULL,
    "suppressionRulesJson" TEXT NOT NULL DEFAULT '{}',
    "recordingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dataRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "killSwitchReason" TEXT,
    "calleLineId" TEXT,
    "vendorApprovalReference" TEXT,
    "legalApprovalReference" TEXT,
    "localizationApprovalReference" TEXT,
    "productionApprovedAt" TIMESTAMP(3),
    "legalApprovedAt" TIMESTAMP(3),
    "localizationApprovedAt" TIMESTAMP(3),
    "effectiveAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarrierEndpoint" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "carrierName" TEXT NOT NULL,
    "phoneEncrypted" TEXT NOT NULL,
    "phoneHash" TEXT NOT NULL,
    "phoneLastFour" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "verificationSource" TEXT NOT NULL,
    "verificationReference" TEXT,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarrierEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationChallenge" (
    "id" TEXT NOT NULL,
    "supportCaseId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeEncrypted" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxAttempts" INTEGER NOT NULL DEFAULT 2,
    "attemptsUsed" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "verifiedCallAttemptId" TEXT,
    "invalidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallPlan" (
    "id" TEXT NOT NULL,
    "supportCaseId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "taskTextEncrypted" TEXT NOT NULL,
    "resultSchemaJson" TEXT NOT NULL,
    "recipientResultSchemaJson" TEXT,
    "metadataJson" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "recipientKind" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "recipientPhoneEncrypted" TEXT,
    "recipientLabel" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallAttempt" (
    "id" TEXT NOT NULL,
    "supportCaseId" TEXT NOT NULL,
    "callPlanId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'calle',
    "providerCallId" TEXT,
    "callbackNonceHash" TEXT,
    "callbackExpiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "outcome" TEXT,
    "taskCompleted" BOOLEAN,
    "completionConfidenceScore" DOUBLE PRECISION,
    "completionConfidenceLabel" TEXT,
    "structuredResultJson" TEXT,
    "summary" TEXT,
    "evidenceJson" TEXT,
    "providerResponseSanitizedJson" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "resultProcessedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallEvent" (
    "id" TEXT NOT NULL,
    "callAttemptId" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventTime" TIMESTAMP(3) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "sanitizedPayloadJson" TEXT,
    "payloadHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResolutionProposal" (
    "id" TEXT NOT NULL,
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
    "approvedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResolutionProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResolutionExecution" (
    "id" TEXT NOT NULL,
    "resolutionProposalId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "shopifyMutation" TEXT,
    "requestJson" TEXT,
    "responseJson" TEXT,
    "userErrorsJson" TEXT,
    "beforeStateJson" TEXT,
    "afterStateJson" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResolutionExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookReceipt" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalEventId" TEXT,
    "payloadHash" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL DEFAULT false,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processingError" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallEligibilityDecision" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "supportCaseId" TEXT,
    "callPlanId" TEXT,
    "phoneHash" TEXT,
    "region" TEXT,
    "purpose" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "reasonCodesJson" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallEligibilityDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageLedger" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "supportCaseId" TEXT,
    "callAttemptId" TEXT,
    "usageType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'call',
    "estimatedCostMinor" INTEGER,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "billingCycleStart" TIMESTAMP(3),
    "billingCycleEnd" TIMESTAMP(3),
    "included" BOOLEAN NOT NULL DEFAULT false,
    "eventHandle" TEXT,
    "shopifyEventId" TEXT,
    "shopifyReversalEventId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "reportedAt" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reversalReceivedAt" TIMESTAMP(3),
    "reversalIdempotencyKey" TEXT,
    "reversalStatus" TEXT,
    "lastError" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopSubscription" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopifyShopId" TEXT NOT NULL,
    "planHandle" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "billingPeriod" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "currentCycleStart" TIMESTAMP(3),
    "currentCycleEnd" TIMESTAMP(3),
    "cancelAtEndOfCycle" BOOLEAN NOT NULL DEFAULT false,
    "synchronizedAt" TIMESTAMP(3),
    "synchronizationError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyRequest" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "webhookEventIdHash" TEXT NOT NULL,
    "customerIdHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "exportEncrypted" TEXT,
    "payloadEncrypted" TEXT,
    "errorMessage" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "PrivacyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopSettings_shopDomain_key" ON "ShopSettings"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "SupportPolicy_shopId_issueType_key" ON "SupportPolicy"("shopId", "issueType");

-- CreateIndex
CREATE UNIQUE INDEX "SupportCase_publicReference_key" ON "SupportCase"("publicReference");

-- CreateIndex
CREATE INDEX "SupportCase_shopId_shopifyOrderId_idx" ON "SupportCase"("shopId", "shopifyOrderId");

-- CreateIndex
CREATE INDEX "SupportCase_shopId_customerPhoneHash_idx" ON "SupportCase"("shopId", "customerPhoneHash");

-- CreateIndex
CREATE INDEX "CallConsent_shopId_shopifyOrderId_shopifyCustomerId_idx" ON "CallConsent"("shopId", "shopifyOrderId", "shopifyCustomerId");

-- CreateIndex
CREATE INDEX "CallConsent_shopId_phoneHash_revokedAt_expiresAt_idx" ON "CallConsent"("shopId", "phoneHash", "revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "SuppressionEntry_shopId_phoneHash_idx" ON "SuppressionEntry"("shopId", "phoneHash");

-- CreateIndex
CREATE UNIQUE INDEX "SuppressionEntry_scope_phoneHash_key" ON "SuppressionEntry"("scope", "phoneHash");

-- CreateIndex
CREATE INDEX "RegionPolicy_countryCode_enabled_idx" ON "RegionPolicy"("countryCode", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "RegionPolicy_countryCode_version_key" ON "RegionPolicy"("countryCode", "version");

-- CreateIndex
CREATE INDEX "CarrierEndpoint_shopId_enabled_idx" ON "CarrierEndpoint"("shopId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "CarrierEndpoint_shopId_phoneHash_key" ON "CarrierEndpoint"("shopId", "phoneHash");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationChallenge_supportCaseId_key" ON "VerificationChallenge"("supportCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "CallPlan_idempotencyKey_key" ON "CallPlan"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "CallAttempt_callPlanId_key" ON "CallAttempt"("callPlanId");

-- CreateIndex
CREATE INDEX "CallAttempt_supportCaseId_createdAt_idx" ON "CallAttempt"("supportCaseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CallAttempt_provider_providerCallId_key" ON "CallAttempt"("provider", "providerCallId");

-- CreateIndex
CREATE UNIQUE INDEX "CallEvent_callAttemptId_providerEventId_key" ON "CallEvent"("callAttemptId", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "ResolutionProposal_callAttemptId_key" ON "ResolutionProposal"("callAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "ResolutionExecution_idempotencyKey_key" ON "ResolutionExecution"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookReceipt_provider_payloadHash_key" ON "WebhookReceipt"("provider", "payloadHash");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookReceipt_provider_externalEventId_key" ON "WebhookReceipt"("provider", "externalEventId");

-- CreateIndex
CREATE INDEX "CallEligibilityDecision_shopId_evaluatedAt_idx" ON "CallEligibilityDecision"("shopId", "evaluatedAt");

-- CreateIndex
CREATE INDEX "CallEligibilityDecision_supportCaseId_idx" ON "CallEligibilityDecision"("supportCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "UsageLedger_callAttemptId_key" ON "UsageLedger"("callAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "UsageLedger_idempotencyKey_key" ON "UsageLedger"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "UsageLedger_reversalIdempotencyKey_key" ON "UsageLedger"("reversalIdempotencyKey");

-- CreateIndex
CREATE INDEX "UsageLedger_shopId_billingCycleStart_occurredAt_idx" ON "UsageLedger"("shopId", "billingCycleStart", "occurredAt");

-- CreateIndex
CREATE INDEX "UsageLedger_status_nextRetryAt_idx" ON "UsageLedger"("status", "nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShopSubscription_shopId_key" ON "ShopSubscription"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopSubscription_shopifyShopId_key" ON "ShopSubscription"("shopifyShopId");

-- CreateIndex
CREATE UNIQUE INDEX "PrivacyRequest_webhookEventIdHash_key" ON "PrivacyRequest"("webhookEventIdHash");

-- CreateIndex
CREATE INDEX "PrivacyRequest_shopDomain_receivedAt_idx" ON "PrivacyRequest"("shopDomain", "receivedAt");

-- CreateIndex
CREATE INDEX "PrivacyRequest_shopDomain_customerIdHash_idx" ON "PrivacyRequest"("shopDomain", "customerIdHash");

-- AddForeignKey
ALTER TABLE "SupportPolicy" ADD CONSTRAINT "SupportPolicy_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "ShopSettings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "ShopSettings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "ShopSettings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "CallConsent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallConsent" ADD CONSTRAINT "CallConsent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "ShopSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuppressionEntry" ADD CONSTRAINT "SuppressionEntry_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "ShopSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierEndpoint" ADD CONSTRAINT "CarrierEndpoint_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "ShopSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationChallenge" ADD CONSTRAINT "VerificationChallenge_supportCaseId_fkey" FOREIGN KEY ("supportCaseId") REFERENCES "SupportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallPlan" ADD CONSTRAINT "CallPlan_supportCaseId_fkey" FOREIGN KEY ("supportCaseId") REFERENCES "SupportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallAttempt" ADD CONSTRAINT "CallAttempt_supportCaseId_fkey" FOREIGN KEY ("supportCaseId") REFERENCES "SupportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallAttempt" ADD CONSTRAINT "CallAttempt_callPlanId_fkey" FOREIGN KEY ("callPlanId") REFERENCES "CallPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallEvent" ADD CONSTRAINT "CallEvent_callAttemptId_fkey" FOREIGN KEY ("callAttemptId") REFERENCES "CallAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResolutionProposal" ADD CONSTRAINT "ResolutionProposal_supportCaseId_fkey" FOREIGN KEY ("supportCaseId") REFERENCES "SupportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResolutionExecution" ADD CONSTRAINT "ResolutionExecution_resolutionProposalId_fkey" FOREIGN KEY ("resolutionProposalId") REFERENCES "ResolutionProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_supportCaseId_fkey" FOREIGN KEY ("supportCaseId") REFERENCES "SupportCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopSubscription" ADD CONSTRAINT "ShopSubscription_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "ShopSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
