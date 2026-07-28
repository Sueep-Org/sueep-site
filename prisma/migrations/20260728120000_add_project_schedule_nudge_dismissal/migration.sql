-- CreateTable
CREATE TABLE "ProjectScheduleNudgeDismissal" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dismissedByUserId" TEXT,

    CONSTRAINT "ProjectScheduleNudgeDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectScheduleNudgeDismissal_date_idx" ON "ProjectScheduleNudgeDismissal"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectScheduleNudgeDismissal_projectId_date_key" ON "ProjectScheduleNudgeDismissal"("projectId", "date");

-- AddForeignKey
ALTER TABLE "ProjectScheduleNudgeDismissal" ADD CONSTRAINT "ProjectScheduleNudgeDismissal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectScheduleNudgeDismissal" ADD CONSTRAINT "ProjectScheduleNudgeDismissal_dismissedByUserId_fkey" FOREIGN KEY ("dismissedByUserId") REFERENCES "ErpUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
