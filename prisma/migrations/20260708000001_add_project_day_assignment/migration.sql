-- CreateTable
CREATE TABLE "ProjectDayAssignment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "supervisorUserId" TEXT NOT NULL,

    CONSTRAINT "ProjectDayAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectDayAssignment_date_idx" ON "ProjectDayAssignment"("date");

-- CreateIndex
CREATE INDEX "ProjectDayAssignment_supervisorUserId_idx" ON "ProjectDayAssignment"("supervisorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectDayAssignment_projectId_date_key" ON "ProjectDayAssignment"("projectId", "date");

-- AddForeignKey
ALTER TABLE "ProjectDayAssignment" ADD CONSTRAINT "ProjectDayAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDayAssignment" ADD CONSTRAINT "ProjectDayAssignment_supervisorUserId_fkey" FOREIGN KEY ("supervisorUserId") REFERENCES "ErpUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
