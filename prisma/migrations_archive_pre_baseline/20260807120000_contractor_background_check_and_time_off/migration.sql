-- AlterTable
ALTER TABLE "Contractor" ADD COLUMN "backgroundCheckStatus" TEXT DEFAULT 'NOT_DONE';
ALTER TABLE "Contractor" ADD COLUMN "backgroundCheckedAt" TIMESTAMP(3);
ALTER TABLE "Contractor" ADD COLUMN "backgroundCheckExpiresAt" TIMESTAMP(3);
ALTER TABLE "Contractor" ADD COLUMN "backgroundCheckProvider" TEXT;
ALTER TABLE "Contractor" ADD COLUMN "backgroundCheckNotes" TEXT;
ALTER TABLE "Contractor" ADD COLUMN "backgroundCheckConsentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ContractorBackgroundCheckEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contractorId" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "changedBy" TEXT,

    CONSTRAINT "ContractorBackgroundCheckEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorTimeOff" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "contractorId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'VACATION',
    "notes" TEXT,

    CONSTRAINT "ContractorTimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractorBackgroundCheckEvent_contractorId_createdAt_idx" ON "ContractorBackgroundCheckEvent"("contractorId", "createdAt");

-- CreateIndex
CREATE INDEX "ContractorTimeOff_contractorId_startDate_endDate_idx" ON "ContractorTimeOff"("contractorId", "startDate", "endDate");

-- AddForeignKey
ALTER TABLE "ContractorBackgroundCheckEvent" ADD CONSTRAINT "ContractorBackgroundCheckEvent_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorTimeOff" ADD CONSTRAINT "ContractorTimeOff_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
