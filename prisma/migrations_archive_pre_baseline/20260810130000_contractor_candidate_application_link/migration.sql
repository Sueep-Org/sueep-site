-- AlterTable
ALTER TABLE "Contractor" ADD COLUMN "candidateApplicationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Contractor_candidateApplicationId_key" ON "Contractor"("candidateApplicationId");

-- AddForeignKey
ALTER TABLE "Contractor" ADD CONSTRAINT "Contractor_candidateApplicationId_fkey" FOREIGN KEY ("candidateApplicationId") REFERENCES "CandidateApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;
