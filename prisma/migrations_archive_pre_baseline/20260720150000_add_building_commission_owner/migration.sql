-- AlterTable
ALTER TABLE "Building" ADD COLUMN     "commissionEmployeeId" TEXT;

-- CreateIndex
CREATE INDEX "Building_commissionEmployeeId_idx" ON "Building"("commissionEmployeeId");

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_commissionEmployeeId_fkey" FOREIGN KEY ("commissionEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
