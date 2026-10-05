-- Repeating manual hours on Payroll: a rule per repeat, and a link from
-- each filled-in entry back to it.

-- CreateTable
CREATE TABLE "ManualHoursRepeat" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "employeeId" TEXT NOT NULL,
    "firstFrom" TIMESTAMP(3) NOT NULL,
    "firstTo" TIMESTAMP(3) NOT NULL,
    "everyDays" INTEGER NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "filledThrough" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "ManualHoursRepeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManualHoursRepeat_employeeId_idx" ON "ManualHoursRepeat"("employeeId");

-- AddForeignKey
ALTER TABLE "ManualHoursRepeat" ADD CONSTRAINT "ManualHoursRepeat_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ManualHoursEntry" ADD COLUMN "repeatId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ManualHoursEntry_repeatId_workDate_key" ON "ManualHoursEntry"("repeatId", "workDate");

-- AddForeignKey
ALTER TABLE "ManualHoursEntry" ADD CONSTRAINT "ManualHoursEntry_repeatId_fkey" FOREIGN KEY ("repeatId") REFERENCES "ManualHoursRepeat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
