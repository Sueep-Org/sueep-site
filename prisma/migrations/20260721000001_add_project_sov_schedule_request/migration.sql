-- CreateTable
CREATE TABLE "ProjectSovScheduleRequest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,
    "sovItemId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requestedEmail" TEXT NOT NULL,
    "requestedDate" TIMESTAMP(3) NOT NULL,
    "comments" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',

    CONSTRAINT "ProjectSovScheduleRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectSovScheduleRequest_projectId_idx" ON "ProjectSovScheduleRequest"("projectId");

-- CreateIndex
CREATE INDEX "ProjectSovScheduleRequest_sovItemId_idx" ON "ProjectSovScheduleRequest"("sovItemId");

-- AddForeignKey
ALTER TABLE "ProjectSovScheduleRequest" ADD CONSTRAINT "ProjectSovScheduleRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSovScheduleRequest" ADD CONSTRAINT "ProjectSovScheduleRequest_sovItemId_fkey" FOREIGN KEY ("sovItemId") REFERENCES "ProjectSOVItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
