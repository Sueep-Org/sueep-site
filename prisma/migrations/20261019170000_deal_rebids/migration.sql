-- Re-bids of GC Not Awarded losses with the winning GC (PIPELINE_PLAN Phase 5). Additive only.

-- CreateTable
CREATE TABLE "DealRebid" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromDealId" TEXT NOT NULL,
    "newDealId" TEXT NOT NULL,
    "winningCompanyId" TEXT,
    "winningName" TEXT NOT NULL,
    "byEmail" TEXT NOT NULL,

    CONSTRAINT "DealRebid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DealRebid_fromDealId_key" ON "DealRebid"("fromDealId");

-- CreateIndex
CREATE UNIQUE INDEX "DealRebid_newDealId_key" ON "DealRebid"("newDealId");
