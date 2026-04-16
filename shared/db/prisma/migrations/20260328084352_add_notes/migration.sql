-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "slug" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "authorType" TEXT NOT NULL DEFAULT 'USER',
    "authorId" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Note_slug_key" ON "Note"("slug");

-- CreateIndex
CREATE INDEX "Note_authorType_authorId_idx" ON "Note"("authorType", "authorId");

-- CreateIndex
CREATE INDEX "Note_isPinned_updatedAt_idx" ON "Note"("isPinned", "updatedAt");

-- CreateIndex
CREATE INDEX "Note_tags_idx" ON "Note"("tags");

-- CreateIndex
CREATE INDEX "Note_deletedAt_idx" ON "Note"("deletedAt");
