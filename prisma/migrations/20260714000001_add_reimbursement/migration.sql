-- CreateTable
CREATE TABLE "Reimbursement" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "employeeId" TEXT NOT NULL,
    "companyOrTeam" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "receiptUrl" TEXT,
    "receiptData" BYTEA,
    "receiptMimeType" TEXT,
    "receiptFilename" TEXT,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Reimbursement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reimbursement_employeeId_idx" ON "Reimbursement"("employeeId");

-- CreateIndex
CREATE INDEX "Reimbursement_paidAt_idx" ON "Reimbursement"("paidAt");

-- AddForeignKey
ALTER TABLE "Reimbursement" ADD CONSTRAINT "Reimbursement_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
