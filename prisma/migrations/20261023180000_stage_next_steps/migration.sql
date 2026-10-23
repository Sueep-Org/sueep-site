-- Automatic next steps per stage, and the last stage seen per deal.
ALTER TABLE "DealStageRule" ADD COLUMN "nextStepText" TEXT;
ALTER TABLE "DealStageRule" ADD COLUMN "nextStepDays" INTEGER;
ALTER TABLE "DealStageRule" ADD COLUMN "nextStepBidDate" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "DealStageSeen" (
    "hubspotDealId" TEXT NOT NULL,
    "pipeline" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealStageSeen_pkey" PRIMARY KEY ("hubspotDealId")
);
