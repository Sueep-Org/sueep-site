-- CreateTable
CREATE TABLE "JanitorialShiftPattern" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "recurringContractId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "daysOfWeek" INTEGER[],
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveUntil" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "JanitorialShiftPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JanitorialShiftException" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "recurringContractId" TEXT NOT NULL,
    "patternId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "employeeId" TEXT,
    "startTime" TEXT,
    "endTime" TEXT,
    "notes" TEXT,

    CONSTRAINT "JanitorialShiftException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JanitorialShiftPattern_recurringContractId_idx" ON "JanitorialShiftPattern"("recurringContractId");

-- CreateIndex
CREATE INDEX "JanitorialShiftPattern_employeeId_idx" ON "JanitorialShiftPattern"("employeeId");

-- CreateIndex
CREATE INDEX "JanitorialShiftException_recurringContractId_date_idx" ON "JanitorialShiftException"("recurringContractId", "date");

-- CreateIndex
CREATE INDEX "JanitorialShiftException_date_idx" ON "JanitorialShiftException"("date");

-- CreateIndex
CREATE UNIQUE INDEX "JanitorialShiftException_patternId_date_key" ON "JanitorialShiftException"("patternId", "date");

-- AddForeignKey
ALTER TABLE "JanitorialShiftPattern" ADD CONSTRAINT "JanitorialShiftPattern_recurringContractId_fkey" FOREIGN KEY ("recurringContractId") REFERENCES "RecurringContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JanitorialShiftPattern" ADD CONSTRAINT "JanitorialShiftPattern_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JanitorialShiftException" ADD CONSTRAINT "JanitorialShiftException_recurringContractId_fkey" FOREIGN KEY ("recurringContractId") REFERENCES "RecurringContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JanitorialShiftException" ADD CONSTRAINT "JanitorialShiftException_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "JanitorialShiftPattern"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JanitorialShiftException" ADD CONSTRAINT "JanitorialShiftException_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
