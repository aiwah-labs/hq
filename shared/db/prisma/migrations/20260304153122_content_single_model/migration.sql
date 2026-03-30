-- CreateTable
CREATE TABLE "Content" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'idea',
    "platform" TEXT,
    "source" TEXT,
    "externalUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Content_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Content_status_updatedAt_idx" ON "Content"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "Content_platform_idx" ON "Content"("platform");

-- CreateIndex
CREATE INDEX "Content_createdByUserId_idx" ON "Content"("createdByUserId");

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
