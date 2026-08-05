-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "backgroundCheckConsentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EmployeeBackgroundCheckEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "employeeId" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "changedBy" TEXT,

    CONSTRAINT "EmployeeBackgroundCheckEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeBackgroundCheckEvent_employeeId_createdAt_idx" ON "EmployeeBackgroundCheckEvent"("employeeId", "createdAt");

-- AddForeignKey
ALTER TABLE "EmployeeBackgroundCheckEvent" ADD CONSTRAINT "EmployeeBackgroundCheckEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
