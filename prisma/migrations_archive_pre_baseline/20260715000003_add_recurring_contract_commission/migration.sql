-- AlterTable
ALTER TABLE "RecurringContract" ADD COLUMN     "commissionEmployeeId" TEXT;

-- AlterTable
ALTER TABLE "RecurringContractPeriod" ADD COLUMN     "commissionPaidAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "RecurringContract_commissionEmployeeId_idx" ON "RecurringContract"("commissionEmployeeId");

-- AddForeignKey
ALTER TABLE "RecurringContract" ADD CONSTRAINT "RecurringContract_commissionEmployeeId_fkey" FOREIGN KEY ("commissionEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
