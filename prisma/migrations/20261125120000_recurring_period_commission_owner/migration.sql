-- AlterTable
ALTER TABLE "RecurringContractPeriod" ADD COLUMN     "commissionEmployeeId" TEXT;

-- AddForeignKey
ALTER TABLE "RecurringContractPeriod" ADD CONSTRAINT "RecurringContractPeriod_commissionEmployeeId_fkey" FOREIGN KEY ("commissionEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
