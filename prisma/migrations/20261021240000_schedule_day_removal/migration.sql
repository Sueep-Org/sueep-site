-- Schedule: keep a grayed-out record (with a reason) when a planned day is removed for a real reason. Additive only.

-- CreateTable
CREATE TABLE "ScheduleDayRemoval" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "coveredBy" TEXT,
    "removedByName" TEXT,

    CONSTRAINT "ScheduleDayRemoval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleDayRemoval_date_idx" ON "ScheduleDayRemoval"("date");

-- AddForeignKey
ALTER TABLE "ScheduleDayRemoval" ADD CONSTRAINT "ScheduleDayRemoval_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
