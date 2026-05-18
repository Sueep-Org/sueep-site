-- AlterTable: add portal fields to Contractor
ALTER TABLE "Contractor"
  ADD COLUMN "paperwork"                  JSONB,
  ADD COLUMN "paperworkUploadToken"       TEXT,
  ADD COLUMN "paperworkUploadTokenExpiry" TIMESTAMP(3),
  ADD COLUMN "infoToken"                  TEXT,
  ADD COLUMN "infoTokenExpiry"            TIMESTAMP(3),
  ADD COLUMN "contractorFullName"         TEXT,
  ADD COLUMN "address"                    TEXT,
  ADD COLUMN "dateOfBirth"               TEXT,
  ADD COLUMN "ssn"                        TEXT,
  ADD COLUMN "bankAccountType"            TEXT,
  ADD COLUMN "bankAccountNumber"          TEXT,
  ADD COLUMN "bankRoutingNumber"          TEXT,
  ADD COLUMN "phone"                      TEXT,
  ADD COLUMN "hasInsurance"               BOOLEAN;

-- UniqueIndex
CREATE UNIQUE INDEX "Contractor_paperworkUploadToken_key" ON "Contractor"("paperworkUploadToken");
CREATE UNIQUE INDEX "Contractor_infoToken_key" ON "Contractor"("infoToken");

-- CreateTable: ContractorDocument
CREATE TABLE "ContractorDocument" (
    "id"           TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contractorId" TEXT NOT NULL,
    "label"        TEXT NOT NULL,
    "filename"     TEXT NOT NULL,
    "mimeType"     TEXT NOT NULL,
    "size"         INTEGER NOT NULL,
    "data"         BYTEA NOT NULL,

    CONSTRAINT "ContractorDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContractorDocument_contractorId_idx" ON "ContractorDocument"("contractorId");

ALTER TABLE "ContractorDocument"
  ADD CONSTRAINT "ContractorDocument_contractorId_fkey"
  FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
