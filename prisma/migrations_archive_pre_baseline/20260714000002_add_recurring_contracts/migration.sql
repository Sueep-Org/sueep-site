-- CreateTable
CREATE TABLE "RecurringContract" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "buildingId" TEXT NOT NULL,
    "monthlyRateCents" INTEGER NOT NULL,
    "billingDayOfMonth" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "RecurringContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringContractUnit" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recurringContractId" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "isCommonArea" BOOLEAN NOT NULL DEFAULT false,
    "fullClean" BOOLEAN NOT NULL DEFAULT true,
    "carpetCleaning" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RecurringContractUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringContractPeriod" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recurringContractId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "billingProjectId" TEXT NOT NULL,

    CONSTRAINT "RecurringContractPeriod_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "recurringContractPeriodId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "RecurringContract_buildingId_key" ON "RecurringContract"("buildingId");

-- CreateIndex
CREATE INDEX "RecurringContract_status_idx" ON "RecurringContract"("status");

-- CreateIndex
CREATE INDEX "RecurringContractUnit_recurringContractId_idx" ON "RecurringContractUnit"("recurringContractId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringContractPeriod_billingProjectId_key" ON "RecurringContractPeriod"("billingProjectId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringContractPeriod_recurringContractId_periodStart_key" ON "RecurringContractPeriod"("recurringContractId", "periodStart");

-- CreateIndex
CREATE INDEX "Project_recurringContractPeriodId_idx" ON "Project"("recurringContractPeriodId");

-- AddForeignKey
ALTER TABLE "RecurringContract" ADD CONSTRAINT "RecurringContract_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringContractUnit" ADD CONSTRAINT "RecurringContractUnit_recurringContractId_fkey" FOREIGN KEY ("recurringContractId") REFERENCES "RecurringContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringContractPeriod" ADD CONSTRAINT "RecurringContractPeriod_recurringContractId_fkey" FOREIGN KEY ("recurringContractId") REFERENCES "RecurringContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_recurringContractPeriodId_fkey" FOREIGN KEY ("recurringContractPeriodId") REFERENCES "RecurringContractPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
