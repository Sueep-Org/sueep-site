-- CreateTable
CREATE TABLE "ChangeOrderContractorAssignment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "changeOrderId" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "role" TEXT,
    "assignedDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "costCents" INTEGER,

    CONSTRAINT "ChangeOrderContractorAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChangeOrderContractorAssignment_changeOrderId_idx" ON "ChangeOrderContractorAssignment"("changeOrderId");

-- CreateIndex
CREATE INDEX "ChangeOrderContractorAssignment_contractorId_idx" ON "ChangeOrderContractorAssignment"("contractorId");

-- AddForeignKey
ALTER TABLE "ChangeOrderContractorAssignment" ADD CONSTRAINT "ChangeOrderContractorAssignment_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ProjectChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderContractorAssignment" ADD CONSTRAINT "ChangeOrderContractorAssignment_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
