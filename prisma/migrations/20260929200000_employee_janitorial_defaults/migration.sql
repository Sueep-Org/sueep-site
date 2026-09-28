-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "janitorialDefaultContractId" TEXT,
ADD COLUMN     "janitorialWeeklyHours" DOUBLE PRECISION;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_janitorialDefaultContractId_fkey" FOREIGN KEY ("janitorialDefaultContractId") REFERENCES "RecurringContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

