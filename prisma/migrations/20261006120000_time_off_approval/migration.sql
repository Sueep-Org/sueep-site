-- Time off approvals and Admin override of the yearly paid day limit.
-- Existing rows default to APPROVED; the API creates new ones as PENDING.

-- AlterTable
ALTER TABLE "EmployeeTimeOff" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "requestedBy" TEXT,
ADD COLUMN     "reviewedBy" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "limitOverride" TEXT,
ADD COLUMN     "unpaidDays" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ContractorTimeOff" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "requestedBy" TEXT,
ADD COLUMN     "reviewedBy" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewNote" TEXT;

-- CreateIndex
CREATE INDEX "EmployeeTimeOff_status_idx" ON "EmployeeTimeOff"("status");

-- CreateIndex
CREATE INDEX "ContractorTimeOff_status_idx" ON "ContractorTimeOff"("status");
