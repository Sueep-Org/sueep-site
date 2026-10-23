-- Following deals on the Deals board, and the last state alerted on.
CREATE TABLE "DealFollower" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hubspotDealId" TEXT NOT NULL,
    "pipeline" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,

    CONSTRAINT "DealFollower_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DealFollowSnapshot" (
    "hubspotDealId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "ownerId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealFollowSnapshot_pkey" PRIMARY KEY ("hubspotDealId")
);

CREATE UNIQUE INDEX "DealFollower_hubspotDealId_userEmail_key" ON "DealFollower"("hubspotDealId", "userEmail");
CREATE INDEX "DealFollower_userEmail_pipeline_idx" ON "DealFollower"("userEmail", "pipeline");
