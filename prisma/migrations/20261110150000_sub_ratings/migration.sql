-- Sub portal Phase 8: ratings from reviews, data for field scores
-- AlterTable
ALTER TABLE "SubCheckIn" ADD COLUMN     "plannedCrew" INTEGER,
ADD COLUMN     "startTime" TEXT;

-- AlterTable
ALTER TABLE "ContractorRating" ADD COLUMN     "reviewId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ContractorRating_reviewId_key" ON "ContractorRating"("reviewId");

