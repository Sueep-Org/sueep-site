-- CreateTable
CREATE TABLE "ContractorAssignment" (
    "id"                TEXT         NOT NULL,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,
    "turnoverRequestId" TEXT         NOT NULL,
    "contractorId"      TEXT         NOT NULL,
    "role"              TEXT,
    "assignedDate"      TIMESTAMP(3),
    "startDate"         TIMESTAMP(3),
    "endDate"           TIMESTAMP(3),
    "notes"             TEXT,

    CONSTRAINT "ContractorAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractorAssignment_turnoverRequestId_idx" ON "ContractorAssignment"("turnoverRequestId");
CREATE INDEX "ContractorAssignment_contractorId_idx" ON "ContractorAssignment"("contractorId");

-- AddForeignKey
ALTER TABLE "ContractorAssignment" ADD CONSTRAINT "ContractorAssignment_turnoverRequestId_fkey"
    FOREIGN KEY ("turnoverRequestId") REFERENCES "TurnoverRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorAssignment" ADD CONSTRAINT "ContractorAssignment_contractorId_fkey"
    FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
