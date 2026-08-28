-- AlterTable: add bank account fields to CandidateApplication
ALTER TABLE "CandidateApplication"
  ADD COLUMN "bankAccountRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "bankAccountType"     TEXT,
  ADD COLUMN "bankAccountNumber"   TEXT,
  ADD COLUMN "bankRoutingNumber"   TEXT;

-- AlterTable: add bank account fields to Employee
ALTER TABLE "Employee"
  ADD COLUMN "bankAccountType"   TEXT,
  ADD COLUMN "bankAccountNumber" TEXT,
  ADD COLUMN "bankRoutingNumber" TEXT;
