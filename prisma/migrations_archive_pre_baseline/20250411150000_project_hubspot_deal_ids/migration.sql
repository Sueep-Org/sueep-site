-- AlterTable
ALTER TABLE "Project" ADD COLUMN "hubspotDealId" TEXT;
ALTER TABLE "Project" ADD COLUMN "hubspotPipelineId" TEXT;
ALTER TABLE "Project" ADD COLUMN "hubspotStageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Project_hubspotDealId_key" ON "Project"("hubspotDealId");
