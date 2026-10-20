-- Pipeline board lost reasons: change log and who won (PIPELINE_PLAN Phase 2). Additive only.

-- CreateTable
CREATE TABLE "DealLostChange" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hubspotDealId" TEXT NOT NULL,
    "pipeline" TEXT NOT NULL,
    "dealName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStageId" TEXT NOT NULL,
    "toStageId" TEXT NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "previousReasons" TEXT,
    "byEmail" TEXT NOT NULL,

    CONSTRAINT "DealLostChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealLostWinner" (
    "hubspotDealId" TEXT NOT NULL,
    "winningCompanyId" TEXT,
    "winningName" TEXT NOT NULL,
    "winningPriceCents" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByEmail" TEXT NOT NULL,

    CONSTRAINT "DealLostWinner_pkey" PRIMARY KEY ("hubspotDealId")
);

-- CreateIndex
CREATE INDEX "DealLostChange_hubspotDealId_idx" ON "DealLostChange"("hubspotDealId");

-- CreateIndex
CREATE INDEX "DealLostChange_createdAt_idx" ON "DealLostChange"("createdAt");
