-- CreateTable
CREATE TABLE "EmployeeTimeOff" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'VACATION',
    "notes" TEXT,

    CONSTRAINT "EmployeeTimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeTimeOff_employeeId_startDate_endDate_idx" ON "EmployeeTimeOff"("employeeId", "startDate", "endDate");

-- AddForeignKey
ALTER TABLE "EmployeeTimeOff" ADD CONSTRAINT "EmployeeTimeOff_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
