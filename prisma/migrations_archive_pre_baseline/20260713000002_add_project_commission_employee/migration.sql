-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "commissionEmployeeId" TEXT;

-- CreateIndex
CREATE INDEX "Project_commissionEmployeeId_idx" ON "Project"("commissionEmployeeId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_commissionEmployeeId_fkey" FOREIGN KEY ("commissionEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
