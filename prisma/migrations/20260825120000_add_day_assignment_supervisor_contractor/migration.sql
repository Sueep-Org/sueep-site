-- AlterTable
ALTER TABLE "ChangeOrderDayAssignment" ADD COLUMN     "supervisorContractorId" TEXT;

-- AlterTable
ALTER TABLE "ProjectDayAssignment" ADD COLUMN     "supervisorContractorId" TEXT;

-- AlterTable
ALTER TABLE "ProjectScheduleSeries" ADD COLUMN     "supervisorContractorId" TEXT;

-- CreateIndex
CREATE INDEX "ChangeOrderDayAssignment_supervisorContractorId_idx" ON "ChangeOrderDayAssignment"("supervisorContractorId");

-- CreateIndex
CREATE INDEX "ProjectDayAssignment_supervisorContractorId_idx" ON "ProjectDayAssignment"("supervisorContractorId");

-- AddForeignKey
ALTER TABLE "ChangeOrderDayAssignment" ADD CONSTRAINT "ChangeOrderDayAssignment_supervisorContractorId_fkey" FOREIGN KEY ("supervisorContractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDayAssignment" ADD CONSTRAINT "ProjectDayAssignment_supervisorContractorId_fkey" FOREIGN KEY ("supervisorContractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
