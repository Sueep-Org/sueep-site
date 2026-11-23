-- CreateTable
CREATE TABLE "ScheduleDayCompletion" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,
    "changeOrderId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "key" TEXT NOT NULL,
    "completedBy" TEXT NOT NULL,
    "completedByName" TEXT,

    CONSTRAINT "ScheduleDayCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleDayCompletion_key_key" ON "ScheduleDayCompletion"("key");

-- CreateIndex
CREATE INDEX "ScheduleDayCompletion_date_idx" ON "ScheduleDayCompletion"("date");

-- AddForeignKey
ALTER TABLE "ScheduleDayCompletion" ADD CONSTRAINT "ScheduleDayCompletion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleDayCompletion" ADD CONSTRAINT "ScheduleDayCompletion_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ProjectChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
