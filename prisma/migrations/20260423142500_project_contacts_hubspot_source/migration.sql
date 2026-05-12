-- AlterTable
ALTER TABLE "ProjectContact"
ADD COLUMN "hubspotContactId" TEXT,
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL';

-- CreateIndex
CREATE INDEX "ProjectContact_projectId_source_idx" ON "ProjectContact"("projectId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectContact_projectId_hubspotContactId_key" ON "ProjectContact"("projectId", "hubspotContactId");