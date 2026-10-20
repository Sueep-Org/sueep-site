-- Pipeline board deal info edits (PIPELINE_PLAN Phase 7) and daily pipeline snapshots (Phase 8 groundwork). Additive only.

-- CreateTable
CREATE TABLE "DealInfoChange" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hubspotDealId" TEXT NOT NULL,
    "pipeline" TEXT NOT NULL,
    "dealName" TEXT NOT NULL,
    "property" TEXT NOT NULL,
    "fromValue" TEXT NOT NULL,
    "toValue" TEXT NOT NULL,
    "byEmail" TEXT NOT NULL,

    CONSTRAINT "DealInfoChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineSnapshot" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "day" TEXT NOT NULL,
    "pipeline" TEXT NOT NULL,
    "hubspotDealId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "cents" INTEGER NOT NULL,
    "ownerId" TEXT,

    CONSTRAINT "PipelineSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealInfoChange_hubspotDealId_idx" ON "DealInfoChange"("hubspotDealId");

-- CreateIndex
CREATE INDEX "DealInfoChange_createdAt_idx" ON "DealInfoChange"("createdAt");

-- CreateIndex
CREATE INDEX "PipelineSnapshot_day_idx" ON "PipelineSnapshot"("day");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineSnapshot_day_hubspotDealId_key" ON "PipelineSnapshot"("day", "hubspotDealId");
