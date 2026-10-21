-- Deals made with New deal on the Deals board. Additive only, a new empty table.

-- CreateTable
CREATE TABLE "DealCreated" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hubspotDealId" TEXT NOT NULL,
    "pipeline" TEXT NOT NULL,
    "dealName" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "amountCents" INTEGER,
    "ownerId" TEXT,
    "company" TEXT,
    "bidDate" TEXT,
    "walkDate" TEXT,
    "sqft" INTEGER,
    "typeOfBusiness" TEXT,
    "byEmail" TEXT NOT NULL,

    CONSTRAINT "DealCreated_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DealCreated_hubspotDealId_key" ON "DealCreated"("hubspotDealId");

-- CreateIndex
CREATE INDEX "DealCreated_pipeline_createdAt_idx" ON "DealCreated"("pipeline", "createdAt");
