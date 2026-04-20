/*
  Warnings:

  - You are about to drop the `MsgMessage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MsgThread` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
ALTER TYPE "WorkflowRunStatus" ADD VALUE 'CANCELLED';

-- DropForeignKey
ALTER TABLE "MsgMessage" DROP CONSTRAINT "MsgMessage_botId_fkey";

-- DropForeignKey
ALTER TABLE "MsgMessage" DROP CONSTRAINT "MsgMessage_threadId_fkey";

-- DropForeignKey
ALTER TABLE "MsgMessage" DROP CONSTRAINT "MsgMessage_userId_fkey";

-- DropTable
DROP TABLE "MsgMessage";

-- DropTable
DROP TABLE "MsgThread";
