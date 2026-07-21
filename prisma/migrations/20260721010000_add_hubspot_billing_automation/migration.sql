-- AlterTable
ALTER TABLE "Building" ADD COLUMN "hubspotDealId" TEXT;

-- CreateEnum
CREATE TYPE "HubSpotLineItemMatchStatus" AS ENUM ('AUTO_APPLIED', 'ALIAS_APPLIED', 'PENDING_REVIEW', 'RESOLVED', 'IGNORED', 'ALREADY_PAID_SKIPPED');

-- CreateTable
CREATE TABLE "HubSpotSovAlias" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,
    "sovItemId" TEXT NOT NULL,
    "hubspotText" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdByName" TEXT NOT NULL,

    CONSTRAINT "HubSpotSovAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubSpotUnitAlias" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "buildingId" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "hubspotText" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdByName" TEXT NOT NULL,

    CONSTRAINT "HubSpotUnitAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubSpotInvoiceLineItemMatch" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "hubspotInvoiceId" TEXT NOT NULL,
    "hubspotLineItemId" TEXT NOT NULL,
    "hubspotDealId" TEXT,
    "lineItemText" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "projectId" TEXT,
    "buildingId" TEXT,
    "matchedSovItemId" TEXT,
    "matchedUnitNumber" TEXT,
    "matchedTurnoverRequestId" TEXT,
    "matchMethod" TEXT,
    "matchScore" DOUBLE PRECISION,
    "candidatesJson" JSONB,
    "status" "HubSpotLineItemMatchStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "resolvedByUserId" TEXT,
    "resolvedByName" TEXT,
    "createAlias" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "HubSpotInvoiceLineItemMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Building_hubspotDealId_key" ON "Building"("hubspotDealId");

-- CreateIndex
CREATE INDEX "HubSpotSovAlias_sovItemId_idx" ON "HubSpotSovAlias"("sovItemId");

-- CreateIndex
CREATE UNIQUE INDEX "HubSpotSovAlias_projectId_hubspotText_key" ON "HubSpotSovAlias"("projectId", "hubspotText");

-- CreateIndex
CREATE INDEX "HubSpotUnitAlias_buildingId_unitNumber_idx" ON "HubSpotUnitAlias"("buildingId", "unitNumber");

-- CreateIndex
CREATE UNIQUE INDEX "HubSpotUnitAlias_buildingId_hubspotText_key" ON "HubSpotUnitAlias"("buildingId", "hubspotText");

-- CreateIndex
CREATE UNIQUE INDEX "HubSpotInvoiceLineItemMatch_hubspotLineItemId_key" ON "HubSpotInvoiceLineItemMatch"("hubspotLineItemId");

-- CreateIndex
CREATE INDEX "HubSpotInvoiceLineItemMatch_hubspotInvoiceId_idx" ON "HubSpotInvoiceLineItemMatch"("hubspotInvoiceId");

-- CreateIndex
CREATE INDEX "HubSpotInvoiceLineItemMatch_status_idx" ON "HubSpotInvoiceLineItemMatch"("status");

-- CreateIndex
CREATE INDEX "HubSpotInvoiceLineItemMatch_projectId_idx" ON "HubSpotInvoiceLineItemMatch"("projectId");

-- CreateIndex
CREATE INDEX "HubSpotInvoiceLineItemMatch_buildingId_idx" ON "HubSpotInvoiceLineItemMatch"("buildingId");

-- CreateIndex
CREATE INDEX "TurnoverRequest_buildingId_unitNumber_billingStatus_idx" ON "TurnoverRequest"("buildingId", "unitNumber", "billingStatus");

-- AddForeignKey
ALTER TABLE "HubSpotSovAlias" ADD CONSTRAINT "HubSpotSovAlias_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubSpotSovAlias" ADD CONSTRAINT "HubSpotSovAlias_sovItemId_fkey" FOREIGN KEY ("sovItemId") REFERENCES "ProjectSOVItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubSpotSovAlias" ADD CONSTRAINT "HubSpotSovAlias_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "ErpUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubSpotUnitAlias" ADD CONSTRAINT "HubSpotUnitAlias_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubSpotUnitAlias" ADD CONSTRAINT "HubSpotUnitAlias_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "ErpUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubSpotInvoiceLineItemMatch" ADD CONSTRAINT "HubSpotInvoiceLineItemMatch_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubSpotInvoiceLineItemMatch" ADD CONSTRAINT "HubSpotInvoiceLineItemMatch_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubSpotInvoiceLineItemMatch" ADD CONSTRAINT "HubSpotInvoiceLineItemMatch_matchedSovItemId_fkey" FOREIGN KEY ("matchedSovItemId") REFERENCES "ProjectSOVItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubSpotInvoiceLineItemMatch" ADD CONSTRAINT "HubSpotInvoiceLineItemMatch_matchedTurnoverRequestId_fkey" FOREIGN KEY ("matchedTurnoverRequestId") REFERENCES "TurnoverRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubSpotInvoiceLineItemMatch" ADD CONSTRAINT "HubSpotInvoiceLineItemMatch_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "ErpUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
