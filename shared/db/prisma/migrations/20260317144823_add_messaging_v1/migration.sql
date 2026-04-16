-- CreateEnum (idempotent)
DO $$ BEGIN CREATE TYPE "MsgThreadType" AS ENUM ('DM', 'GROUP', 'CHANNEL'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum (idempotent)
DO $$ BEGIN CREATE TYPE "MsgActorType" AS ENUM ('USER', 'BOT'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum (idempotent)
DO $$ BEGIN CREATE TYPE "MsgContentType" AS ENUM ('TEXT', 'CARD', 'SYSTEM', 'TOOL_RESULT', 'WORKFLOW'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- DropForeignKey (idempotent)
ALTER TABLE "CrmProspect" DROP CONSTRAINT IF EXISTS "CrmProspect_campaignId_fkey";

-- DropIndex (idempotent)
DROP INDEX IF EXISTS "CrmProspect_contactId_campaignId_key";

-- AlterTable (idempotent)
ALTER TABLE "CrmCampaign" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "CrmCampaign" ADD COLUMN IF NOT EXISTS "externalUrl" TEXT;
ALTER TABLE "CrmCampaign" ADD COLUMN IF NOT EXISTS "platform" TEXT;

-- AlterTable (idempotent)
ALTER TABLE "CrmCompany" ADD COLUMN IF NOT EXISTS "stage" "ProspectStage" NOT NULL DEFAULT 'PROSPECT';

-- AlterTable (idempotent — DROP NOT NULL is safe to re-run if already nullable)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'CrmProspect' AND column_name = 'campaignId' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "CrmProspect" ALTER COLUMN "campaignId" DROP NOT NULL;
  END IF;
END $$;

-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "BotMessagingConfig" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "webhookUrl" TEXT,
    "webhookSecret" TEXT,
    "webhookEvents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "streamingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "typingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "onlineStatus" TEXT NOT NULL DEFAULT 'offline',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotMessagingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "MsgThread" (
    "id" TEXT NOT NULL,
    "type" "MsgThreadType" NOT NULL DEFAULT 'GROUP',
    "name" TEXT,
    "description" TEXT,
    "avatarUrl" TEXT,
    "iconEmoji" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "lastMessageId" TEXT,
    "createdByType" "MsgActorType" NOT NULL,
    "createdById" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MsgThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "MsgParticipant" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "actorType" "MsgActorType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "isMuted" BOOLEAN NOT NULL DEFAULT false,
    "notifyLevel" TEXT NOT NULL DEFAULT 'all',
    "lastReadAt" TIMESTAMP(3),
    "lastReadMessageId" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "addedByType" "MsgActorType",
    "addedById" TEXT,

    CONSTRAINT "MsgParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "MsgMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderType" "MsgActorType" NOT NULL,
    "senderId" TEXT NOT NULL,
    "parentMessageId" TEXT,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT NOT NULL DEFAULT '',
    "contentType" "MsgContentType" NOT NULL DEFAULT 'TEXT',
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "editedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "streamingStatus" TEXT,
    "sequenceNumber" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MsgMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "MsgAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "url" TEXT,
    "thumbnailKey" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "uploadedByType" "MsgActorType" NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MsgAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "MsgReaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "reactorType" "MsgActorType" NOT NULL,
    "reactorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MsgReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "MsgPin" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "pinnedByType" "MsgActorType" NOT NULL,
    "pinnedById" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MsgPin_pkey" PRIMARY KEY ("id")
);

-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "MsgBookmark" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MsgBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "MsgNotification" (
    "id" TEXT NOT NULL,
    "recipientType" "MsgActorType" NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "threadId" TEXT,
    "messageId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MsgNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "MsgDelivery" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "recipientType" "MsgActorType" NOT NULL,
    "recipientId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "MsgDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "MsgDraft" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "actorType" "MsgActorType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MsgDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "BotMessagingConfig_botId_key" ON "BotMessagingConfig"("botId");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "MsgThread_type_idx" ON "MsgThread"("type");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "MsgThread_lastMessageAt_idx" ON "MsgThread"("lastMessageAt");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "MsgThread_isArchived_idx" ON "MsgThread"("isArchived");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "MsgThread_createdById_idx" ON "MsgThread"("createdById");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "MsgParticipant_actorType_actorId_idx" ON "MsgParticipant"("actorType", "actorId");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "MsgParticipant_threadId_idx" ON "MsgParticipant"("threadId");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "MsgParticipant_lastReadAt_idx" ON "MsgParticipant"("lastReadAt");

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "MsgParticipant_threadId_actorType_actorId_key" ON "MsgParticipant"("threadId", "actorType", "actorId");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "MsgMessage_threadId_sequenceNumber_idx" ON "MsgMessage"("threadId", "sequenceNumber");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "MsgMessage_threadId_createdAt_idx" ON "MsgMessage"("threadId", "createdAt");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "MsgMessage_senderType_senderId_idx" ON "MsgMessage"("senderType", "senderId");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "MsgMessage_parentMessageId_idx" ON "MsgMessage"("parentMessageId");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "MsgMessage_isDeleted_idx" ON "MsgMessage"("isDeleted");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "MsgAttachment_messageId_idx" ON "MsgAttachment"("messageId");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "MsgAttachment_storageKey_idx" ON "MsgAttachment"("storageKey");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "MsgReaction_messageId_idx" ON "MsgReaction"("messageId");

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "MsgReaction_messageId_emoji_reactorType_reactorId_key" ON "MsgReaction"("messageId", "emoji", "reactorType", "reactorId");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "MsgPin_threadId_idx" ON "MsgPin"("threadId");

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "MsgPin_threadId_messageId_key" ON "MsgPin"("threadId", "messageId");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "MsgBookmark_participantId_idx" ON "MsgBookmark"("participantId");

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "MsgBookmark_participantId_messageId_key" ON "MsgBookmark"("participantId", "messageId");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "MsgNotification_recipientType_recipientId_isRead_idx" ON "MsgNotification"("recipientType", "recipientId", "isRead");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "MsgNotification_recipientType_recipientId_createdAt_idx" ON "MsgNotification"("recipientType", "recipientId", "createdAt");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "MsgNotification_threadId_idx" ON "MsgNotification"("threadId");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "MsgDelivery_messageId_idx" ON "MsgDelivery"("messageId");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "MsgDelivery_recipientType_recipientId_status_idx" ON "MsgDelivery"("recipientType", "recipientId", "status");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "MsgDelivery_status_scheduledAt_idx" ON "MsgDelivery"("status", "scheduledAt");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "MsgDraft_actorType_actorId_idx" ON "MsgDraft"("actorType", "actorId");

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "MsgDraft_threadId_actorType_actorId_key" ON "MsgDraft"("threadId", "actorType", "actorId");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "CrmCompany_stage_idx" ON "CrmCompany"("stage");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "CrmProspect_contactId_idx" ON "CrmProspect"("contactId");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "CrmProspect_campaignId_idx" ON "CrmProspect"("campaignId");

-- AddForeignKey (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'BotMessagingConfig_botId_fkey') THEN
    ALTER TABLE "BotMessagingConfig" ADD CONSTRAINT "BotMessagingConfig_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'CrmProspect_campaignId_fkey') THEN
    ALTER TABLE "CrmProspect" ADD CONSTRAINT "CrmProspect_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CrmCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'MsgParticipant_threadId_fkey') THEN
    ALTER TABLE "MsgParticipant" ADD CONSTRAINT "MsgParticipant_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MsgThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'MsgMessage_threadId_fkey') THEN
    ALTER TABLE "MsgMessage" ADD CONSTRAINT "MsgMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MsgThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'MsgMessage_parentMessageId_fkey') THEN
    ALTER TABLE "MsgMessage" ADD CONSTRAINT "MsgMessage_parentMessageId_fkey" FOREIGN KEY ("parentMessageId") REFERENCES "MsgMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'MsgAttachment_messageId_fkey') THEN
    ALTER TABLE "MsgAttachment" ADD CONSTRAINT "MsgAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "MsgMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'MsgReaction_messageId_fkey') THEN
    ALTER TABLE "MsgReaction" ADD CONSTRAINT "MsgReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "MsgMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'MsgPin_threadId_fkey') THEN
    ALTER TABLE "MsgPin" ADD CONSTRAINT "MsgPin_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MsgThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'MsgPin_messageId_fkey') THEN
    ALTER TABLE "MsgPin" ADD CONSTRAINT "MsgPin_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "MsgMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'MsgBookmark_participantId_fkey') THEN
    ALTER TABLE "MsgBookmark" ADD CONSTRAINT "MsgBookmark_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "MsgParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'MsgBookmark_messageId_fkey') THEN
    ALTER TABLE "MsgBookmark" ADD CONSTRAINT "MsgBookmark_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "MsgMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'MsgNotification_threadId_fkey') THEN
    ALTER TABLE "MsgNotification" ADD CONSTRAINT "MsgNotification_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MsgThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'MsgNotification_messageId_fkey') THEN
    ALTER TABLE "MsgNotification" ADD CONSTRAINT "MsgNotification_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "MsgMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'MsgDelivery_messageId_fkey') THEN
    ALTER TABLE "MsgDelivery" ADD CONSTRAINT "MsgDelivery_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "MsgMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
