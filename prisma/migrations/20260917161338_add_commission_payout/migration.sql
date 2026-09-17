-- CreateTable
CREATE TABLE "CommissionPayout" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "employeeId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceLabel" TEXT NOT NULL,

    CONSTRAINT "CommissionPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommissionPayout_employeeId_idx" ON "CommissionPayout"("employeeId");

-- CreateIndex
CREATE INDEX "CommissionPayout_paidAt_idx" ON "CommissionPayout"("paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionPayout_sourceType_sourceId_key" ON "CommissionPayout"("sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
