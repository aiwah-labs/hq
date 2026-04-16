/*
  Warnings:

  - You are about to drop the column `role` on the `ApiKey` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `ApiKey` table. All the data in the column will be lost.
  - Added the required column `botId` to the `ApiKey` table without a default value. This is not possible if the table is not empty.
  - Added the required column `createdByUserId` to the `ApiKey` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "BotStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BotMembershipRole" AS ENUM ('OWNER', 'MAINTAINER', 'VIEWER');

-- CreateEnum
CREATE TYPE "ApiKeyEventType" AS ENUM ('CREATED', 'REVOKED', 'AUTH_SUCCESS', 'AUTH_FAILURE');

-- DropForeignKey
ALTER TABLE "ApiKey" DROP CONSTRAINT "ApiKey_userId_fkey";

-- DropIndex
DROP INDEX "ApiKey_userId_idx";

-- AlterTable
ALTER TABLE "ApiKey" DROP COLUMN "role",
DROP COLUMN "userId",
ADD COLUMN     "botId" TEXT NOT NULL,
ADD COLUMN     "createdByUserId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Bot" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "BotStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Bot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotMember" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "membershipRole" "BotMembershipRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKeyEvent" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "eventType" "ApiKeyEventType" NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKeyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bot_slug_key" ON "Bot"("slug");

-- CreateIndex
CREATE INDEX "Bot_createdByUserId_idx" ON "Bot"("createdByUserId");

-- CreateIndex
CREATE INDEX "Bot_status_idx" ON "Bot"("status");

-- CreateIndex
CREATE INDEX "BotMember_userId_idx" ON "BotMember"("userId");

-- CreateIndex
CREATE INDEX "BotMember_membershipRole_idx" ON "BotMember"("membershipRole");

-- CreateIndex
CREATE UNIQUE INDEX "BotMember_botId_userId_key" ON "BotMember"("botId", "userId");

-- CreateIndex
CREATE INDEX "ApiKeyEvent_apiKeyId_createdAt_idx" ON "ApiKeyEvent"("apiKeyId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiKeyEvent_eventType_createdAt_idx" ON "ApiKeyEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "ApiKey_botId_idx" ON "ApiKey"("botId");

-- CreateIndex
CREATE INDEX "ApiKey_createdByUserId_idx" ON "ApiKey"("createdByUserId");

-- AddForeignKey
ALTER TABLE "Bot" ADD CONSTRAINT "Bot_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotMember" ADD CONSTRAINT "BotMember_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotMember" ADD CONSTRAINT "BotMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKeyEvent" ADD CONSTRAINT "ApiKeyEvent_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
