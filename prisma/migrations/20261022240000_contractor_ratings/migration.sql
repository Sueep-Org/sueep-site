-- Sub ratings (quality, reliability, communication) and a hand-set pricing score. New table and new nullable columns only.

-- AlterTable
ALTER TABLE "Contractor" ADD COLUMN     "pricingScoreOverride" INTEGER,
ADD COLUMN     "pricingScoreOverrideAt" TIMESTAMP(3),
ADD COLUMN     "pricingScoreOverrideBy" TEXT,
ADD COLUMN     "pricingScoreOverrideNote" TEXT;

-- CreateTable
CREATE TABLE "ContractorRating" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contractorId" TEXT NOT NULL,
    "projectId" TEXT,
    "quality" INTEGER NOT NULL,
    "reliability" INTEGER NOT NULL,
    "communication" INTEGER NOT NULL,
    "note" TEXT,
    "ratedBy" TEXT NOT NULL,
    "ratedByName" TEXT,

    CONSTRAINT "ContractorRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractorRating_contractorId_idx" ON "ContractorRating"("contractorId");

-- AddForeignKey
ALTER TABLE "ContractorRating" ADD CONSTRAINT "ContractorRating_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorRating" ADD CONSTRAINT "ContractorRating_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

