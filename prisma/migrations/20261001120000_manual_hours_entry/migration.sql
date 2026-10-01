-- Hours added by hand on the Payroll page for hourly work not on a project.
CREATE TABLE "ManualHoursEntry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdBy" TEXT,

    CONSTRAINT "ManualHoursEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ManualHoursEntry_employeeId_idx" ON "ManualHoursEntry"("employeeId");
CREATE INDEX "ManualHoursEntry_workDate_idx" ON "ManualHoursEntry"("workDate");

ALTER TABLE "ManualHoursEntry" ADD CONSTRAINT "ManualHoursEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
