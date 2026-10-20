-- Pipeline board next steps (PIPELINE_PLAN Phase 3). Additive only.

-- CreateTable
CREATE TABLE "DealFollowUp" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hubspotDealId" TEXT NOT NULL,
    "pipeline" TEXT NOT NULL,
    "dealName" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "createdByEmail" TEXT NOT NULL,
    "updatedByEmail" TEXT NOT NULL,
    "doneAt" TIMESTAMP(3),
    "doneByEmail" TEXT,

    CONSTRAINT "DealFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealFollowUp_hubspotDealId_idx" ON "DealFollowUp"("hubspotDealId");

-- CreateIndex
CREATE INDEX "DealFollowUp_doneAt_idx" ON "DealFollowUp"("doneAt");
