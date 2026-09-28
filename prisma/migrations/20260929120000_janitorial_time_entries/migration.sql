-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "clockToken" TEXT,
ADD COLUMN     "clockTokenCreatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "JanitorialTimeEntry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "employeeId" TEXT NOT NULL,
    "recurringContractId" TEXT NOT NULL,
    "shiftKey" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "clockInAt" TIMESTAMP(3),
    "clockInLatitude" DOUBLE PRECISION,
    "clockInLongitude" DOUBLE PRECISION,
    "clockInAccuracy" DOUBLE PRECISION,
    "clockOutAt" TIMESTAMP(3),
    "clockOutLatitude" DOUBLE PRECISION,
    "clockOutLongitude" DOUBLE PRECISION,
    "clockOutAccuracy" DOUBLE PRECISION,
    "manualStartTime" TEXT,
    "manualEndTime" TEXT,
    "manualNoShow" BOOLEAN NOT NULL DEFAULT false,
    "manualBy" TEXT,
    "manualAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "JanitorialTimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JanitorialTimeEntry_shiftKey_key" ON "JanitorialTimeEntry"("shiftKey");

-- CreateIndex
CREATE INDEX "JanitorialTimeEntry_employeeId_date_idx" ON "JanitorialTimeEntry"("employeeId", "date");

-- CreateIndex
CREATE INDEX "JanitorialTimeEntry_date_idx" ON "JanitorialTimeEntry"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_clockToken_key" ON "Employee"("clockToken");

-- AddForeignKey
ALTER TABLE "JanitorialTimeEntry" ADD CONSTRAINT "JanitorialTimeEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JanitorialTimeEntry" ADD CONSTRAINT "JanitorialTimeEntry_recurringContractId_fkey" FOREIGN KEY ("recurringContractId") REFERENCES "RecurringContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

