-- AlterTable
ALTER TABLE "CrmCompany" ADD COLUMN "platform" TEXT;
ALTER TABLE "CrmCompany" ADD COLUMN "externalId" TEXT;
ALTER TABLE "CrmCompany" ADD COLUMN "externalUrl" TEXT;

-- CreateIndex
CREATE INDEX "CrmCompany_platform_idx" ON "CrmCompany"("platform");
