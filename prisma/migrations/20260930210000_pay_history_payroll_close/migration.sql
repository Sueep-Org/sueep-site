-- CreateTable
CREATE TABLE "EmployeePayRate" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "employeeId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "payType" TEXT NOT NULL,
    "hourlyPayCents" INTEGER,
    "annualSalaryCents" INTEGER,
    "isOffshore" BOOLEAN NOT NULL DEFAULT false,
    "offshoreMonthlyRateCents" INTEGER,
    "changedBy" TEXT,

    CONSTRAINT "EmployeePayRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPeriodClose" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "rows" JSONB NOT NULL,
    "totalGrossCents" INTEGER NOT NULL,
    "closedBy" TEXT,

    CONSTRAINT "PayrollPeriodClose_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeePayRate_employeeId_idx" ON "EmployeePayRate"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeePayRate_employeeId_effectiveFrom_key" ON "EmployeePayRate"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriodClose_periodStart_key" ON "PayrollPeriodClose"("periodStart");

-- AddForeignKey
ALTER TABLE "EmployeePayRate" ADD CONSTRAINT "EmployeePayRate_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

