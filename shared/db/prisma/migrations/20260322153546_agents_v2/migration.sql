/*
  Warnings:

  - You are about to drop the column `searchVec` on the `MsgMessage` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "MsgMessage_searchVec_idx";

-- AlterTable
ALTER TABLE "MsgMessage" DROP COLUMN "searchVec";

-- CreateTable
CREATE TABLE "PlatformEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "objectType" TEXT,
    "objectId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentThread" (
    "id" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "channelRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "messages" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentConfig" (
    "id" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentChannelSub" (
    "id" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,

    CONSTRAINT "AgentChannelSub_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformEvent_type_idx" ON "PlatformEvent"("type");

-- CreateIndex
CREATE INDEX "PlatformEvent_actorType_actorId_idx" ON "PlatformEvent"("actorType", "actorId");

-- CreateIndex
CREATE INDEX "PlatformEvent_objectType_objectId_idx" ON "PlatformEvent"("objectType", "objectId");

-- CreateIndex
CREATE INDEX "PlatformEvent_createdAt_idx" ON "PlatformEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AgentThread_agentKey_idx" ON "AgentThread"("agentKey");

-- CreateIndex
CREATE INDEX "AgentThread_channelRef_idx" ON "AgentThread"("channelRef");

-- CreateIndex
CREATE INDEX "AgentThread_updatedAt_idx" ON "AgentThread"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentConfig_agentKey_key" ON "AgentConfig"("agentKey");

-- CreateIndex
CREATE INDEX "AgentChannelSub_channelId_idx" ON "AgentChannelSub"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentChannelSub_agentKey_channelId_key" ON "AgentChannelSub"("agentKey", "channelId");
