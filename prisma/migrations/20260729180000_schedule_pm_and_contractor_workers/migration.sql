-- AlterTable
ALTER TABLE "ProjectDayAssignment" ALTER COLUMN "supervisorUserId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ProjectDayAssignment" ADD COLUMN     "projectManagerUserId" TEXT;

-- AlterTable
ALTER TABLE "ProjectScheduleSeries" ADD COLUMN     "projectManagerUserId" TEXT;

-- AlterTable
ALTER TABLE "ProjectWorkerDayAssignment" ALTER COLUMN "employeeId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ProjectWorkerDayAssignment" ADD COLUMN     "contractorId" TEXT;

-- CreateIndex
CREATE INDEX "ProjectDayAssignment_projectManagerUserId_idx" ON "ProjectDayAssignment"("projectManagerUserId");

-- CreateIndex
CREATE INDEX "ProjectWorkerDayAssignment_contractorId_idx" ON "ProjectWorkerDayAssignment"("contractorId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectWorkerDayAssignment_projectId_contractorId_date_key" ON "ProjectWorkerDayAssignment"("projectId", "contractorId", "date");

-- AddForeignKey
ALTER TABLE "ProjectDayAssignment" ADD CONSTRAINT "ProjectDayAssignment_projectManagerUserId_fkey" FOREIGN KEY ("projectManagerUserId") REFERENCES "ErpUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectWorkerDayAssignment" ADD CONSTRAINT "ProjectWorkerDayAssignment_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
