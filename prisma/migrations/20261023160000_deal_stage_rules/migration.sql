-- Deals board stage rules: fields a deal needs before it moves into a stage.
CREATE TABLE "DealStageRule" (
    "id" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "pipeline" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "requiredFields" TEXT[],
    "updatedBy" TEXT,

    CONSTRAINT "DealStageRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DealStageRule_pipeline_stageId_key" ON "DealStageRule"("pipeline", "stageId");
