-- CreateEnum
CREATE TYPE "ReferralRewardStatus" AS ENUM ('PENDING', 'REWARDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MallProductStatus" AS ENUM ('ACTIVE', 'HIDDEN');

-- CreateEnum
CREATE TYPE "MallOrderStatus" AS ENUM ('PENDING', 'ISSUED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdCampaignStatus" AS ENUM ('PENDING_REVIEW', 'ACTIVE', 'PAUSED', 'REJECTED', 'ENDED');

-- CreateEnum
CREATE TYPE "AdLeadStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVERSED');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralAttribution" (
    "refereeId" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "offeringId" TEXT,
    "ipHash" TEXT,
    "uaHash" TEXT,
    "dupSuspect" BOOLEAN NOT NULL DEFAULT false,
    "dupReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralAttribution_pkey" PRIMARY KEY ("refereeId")
);

-- CreateTable
CREATE TABLE "ReferralReward" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "refereeId" TEXT NOT NULL,
    "rewardType" TEXT NOT NULL DEFAULT 'REFERRAL_FIRST_STUDY',
    "enrollmentId" TEXT NOT NULL,
    "studySessionId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "ReferralRewardStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "checks" JSONB,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "ledgerEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MallProduct" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "stock" INTEGER,
    "perUserDaily" INTEGER NOT NULL DEFAULT 3,
    "supplier" TEXT NOT NULL DEFAULT 'TEST',
    "supplierSku" TEXT,
    "status" "MallProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MallProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MallOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "status" "MallOrderStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "supplierRef" TEXT,
    "couponCodeEnc" TEXT,
    "couponLast4" TEXT,
    "isTestCoupon" BOOLEAN NOT NULL DEFAULT true,
    "couponExpires" TIMESTAMP(3),
    "ledgerEntryId" TEXT,
    "failReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MallOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaign" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "advertiserName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "detail" TEXT[],
    "ctaText" TEXT NOT NULL,
    "cpaPrice" INTEGER NOT NULL,
    "targetFields" TEXT[],
    "topics" TEXT[],
    "collectsContact" BOOLEAN NOT NULL DEFAULT false,
    "status" "AdCampaignStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewNote" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdEvent" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "placement" TEXT NOT NULL,
    "userId" TEXT,
    "dedupeKey" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdLead" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "nameEnc" TEXT,
    "phoneEnc" TEXT,
    "phoneLast4" TEXT,
    "consentVersion" TEXT NOT NULL,
    "status" "AdLeadStatus" NOT NULL DEFAULT 'PENDING',
    "duplicateOfId" TEXT,
    "priceSnapshot" INTEGER,
    "rejectReason" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdRevenueEntry" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdRevenueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralAttribution_referrerId_idx" ON "ReferralAttribution"("referrerId");

-- CreateIndex
CREATE INDEX "ReferralAttribution_ipHash_idx" ON "ReferralAttribution"("ipHash");

-- CreateIndex
CREATE INDEX "ReferralReward_referrerId_status_idx" ON "ReferralReward"("referrerId", "status");

-- CreateIndex
CREATE INDEX "ReferralReward_status_createdAt_idx" ON "ReferralReward"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_refereeId_rewardType_key" ON "ReferralReward"("refereeId", "rewardType");

-- CreateIndex
CREATE INDEX "MallOrder_userId_createdAt_idx" ON "MallOrder"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MallOrder_status_createdAt_idx" ON "MallOrder"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MallOrder_userId_idempotencyKey_key" ON "MallOrder"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "AdEvent_dedupeKey_key" ON "AdEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "AdEvent_campaignId_eventType_occurredAt_idx" ON "AdEvent"("campaignId", "eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "AdLead_campaignId_status_idx" ON "AdLead"("campaignId", "status");

-- CreateIndex
CREATE INDEX "AdLead_userId_campaignId_idx" ON "AdLead"("userId", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "AdRevenueEntry_dedupeKey_key" ON "AdRevenueEntry"("dedupeKey");

-- CreateIndex
CREATE INDEX "AdRevenueEntry_campaignId_createdAt_idx" ON "AdRevenueEntry"("campaignId", "createdAt");

-- AddForeignKey
ALTER TABLE "MallOrder" ADD CONSTRAINT "MallOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "MallProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdEvent" ADD CONSTRAINT "AdEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdLead" ADD CONSTRAINT "AdLead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
