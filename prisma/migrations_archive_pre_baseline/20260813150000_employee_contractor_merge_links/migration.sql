-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "sourceCandidateApplicationId" TEXT;

-- AlterTable
ALTER TABLE "Contractor" ADD COLUMN "employeeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Employee_sourceCandidateApplicationId_key" ON "Employee"("sourceCandidateApplicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Contractor_employeeId_key" ON "Contractor"("employeeId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_sourceCandidateApplicationId_fkey" FOREIGN KEY ("sourceCandidateApplicationId") REFERENCES "CandidateApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contractor" ADD CONSTRAINT "Contractor_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
