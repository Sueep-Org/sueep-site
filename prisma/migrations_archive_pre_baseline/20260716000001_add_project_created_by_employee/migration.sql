-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "createdByEmployeeId" TEXT;

-- CreateIndex
CREATE INDEX "Project_createdByEmployeeId_idx" ON "Project"("createdByEmployeeId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
