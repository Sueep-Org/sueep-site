-- AlterTable
ALTER TABLE "ProjectWorkerDayAssignment" ADD COLUMN     "assignedSovItemId" TEXT,
ADD COLUMN     "assignedScopeItem" TEXT;

-- CreateIndex
CREATE INDEX "ProjectWorkerDayAssignment_assignedSovItemId_idx" ON "ProjectWorkerDayAssignment"("assignedSovItemId");

-- AddForeignKey
ALTER TABLE "ProjectWorkerDayAssignment" ADD CONSTRAINT "ProjectWorkerDayAssignment_assignedSovItemId_fkey" FOREIGN KEY ("assignedSovItemId") REFERENCES "ProjectSOVItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
