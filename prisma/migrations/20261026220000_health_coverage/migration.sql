-- People on the company health plan and their monthly premium. See src/lib/erp/healthCost.ts.
CREATE TABLE "HealthCoverage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "personName" TEXT NOT NULL,
    "employeeId" TEXT,
    "monthlyPremiumCents" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    CONSTRAINT "HealthCoverage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HealthCoverage_employeeId_idx" ON "HealthCoverage"("employeeId");
ALTER TABLE "HealthCoverage" ADD CONSTRAINT "HealthCoverage_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
