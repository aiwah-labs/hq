-- CreateEnum
CREATE TYPE "ProspectStage" AS ENUM ('PROSPECT', 'OUTREACH', 'ENGAGED', 'MEETING_BOOKED', 'PROPOSAL_SENT', 'CLOSED_WON', 'CLOSED_LOST');

-- CreateEnum
CREATE TYPE "ProspectStatus" AS ENUM ('ACTIVE', 'PAUSED', 'UNSUBSCRIBED', 'BOUNCED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "EmailProvider" AS ENUM ('GOOGLE', 'ZOHO', 'SMTP');

-- CreateTable
CREATE TABLE "CrmCompany" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "industry" TEXT,
    "country" TEXT,
    "city" TEXT,
    "size" TEXT,
    "icpCategory" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmContact" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "email" TEXT,
    "linkedinUrl" TEXT,
    "title" TEXT,
    "phone" TEXT,
    "companyId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vertical" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmCampaignStep" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "delayDays" INTEGER NOT NULL DEFAULT 0,
    "subjectLine" TEXT NOT NULL,
    "bodyTemplate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmCampaignStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmProspect" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "stage" "ProspectStage" NOT NULL DEFAULT 'PROSPECT',
    "status" "ProspectStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedTo" TEXT,
    "nextStepAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmProspect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmOutreachEmail" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "stepNumber" INTEGER,
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmOutreachEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmEmailAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "provider" "EmailProvider" NOT NULL DEFAULT 'SMTP',
    "dailyLimit" INTEGER NOT NULL DEFAULT 40,
    "sentToday" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "warmedUp" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmEmailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmCompany_country_idx" ON "CrmCompany"("country");

-- CreateIndex
CREATE INDEX "CrmCompany_icpCategory_idx" ON "CrmCompany"("icpCategory");

-- CreateIndex
CREATE UNIQUE INDEX "CrmContact_email_key" ON "CrmContact"("email");

-- CreateIndex
CREATE INDEX "CrmContact_companyId_idx" ON "CrmContact"("companyId");

-- CreateIndex
CREATE INDEX "CrmCampaign_status_idx" ON "CrmCampaign"("status");

-- CreateIndex
CREATE INDEX "CrmCampaignStep_campaignId_idx" ON "CrmCampaignStep"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmCampaignStep_campaignId_stepNumber_key" ON "CrmCampaignStep"("campaignId", "stepNumber");

-- CreateIndex
CREATE INDEX "CrmProspect_stage_idx" ON "CrmProspect"("stage");

-- CreateIndex
CREATE INDEX "CrmProspect_nextStepAt_idx" ON "CrmProspect"("nextStepAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmProspect_contactId_campaignId_key" ON "CrmProspect"("contactId", "campaignId");

-- CreateIndex
CREATE INDEX "CrmOutreachEmail_prospectId_idx" ON "CrmOutreachEmail"("prospectId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmEmailAccount_email_key" ON "CrmEmailAccount"("email");

-- AddForeignKey
ALTER TABLE "CrmContact" ADD CONSTRAINT "CrmContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CrmCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCampaignStep" ADD CONSTRAINT "CrmCampaignStep_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CrmCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmProspect" ADD CONSTRAINT "CrmProspect_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmProspect" ADD CONSTRAINT "CrmProspect_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CrmCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmOutreachEmail" ADD CONSTRAINT "CrmOutreachEmail_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "CrmProspect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
