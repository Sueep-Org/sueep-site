-- CreateTable
CREATE TABLE "ProjectScheduleSeries" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,
    "supervisorUserId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "repeatDays" INTEGER[],
    "startTime" TEXT,
    "endTime" TEXT,

    CONSTRAINT "ProjectScheduleSeries_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ProjectDayAssignment" ADD COLUMN     "seriesId" TEXT;

-- AlterTable
ALTER TABLE "ProjectWorkerDayAssignment" ADD COLUMN     "seriesId" TEXT;

-- CreateIndex
CREATE INDEX "ProjectScheduleSeries_projectId_idx" ON "ProjectScheduleSeries"("projectId");

-- CreateIndex
CREATE INDEX "ProjectDayAssignment_seriesId_idx" ON "ProjectDayAssignment"("seriesId");

-- CreateIndex
CREATE INDEX "ProjectWorkerDayAssignment_seriesId_idx" ON "ProjectWorkerDayAssignment"("seriesId");

-- AddForeignKey
ALTER TABLE "ProjectScheduleSeries" ADD CONSTRAINT "ProjectScheduleSeries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDayAssignment" ADD CONSTRAINT "ProjectDayAssignment_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "ProjectScheduleSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectWorkerDayAssignment" ADD CONSTRAINT "ProjectWorkerDayAssignment_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "ProjectScheduleSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
