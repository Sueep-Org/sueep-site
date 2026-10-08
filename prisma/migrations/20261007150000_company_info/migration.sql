-- CreateTable
CREATE TABLE "CompanyInfoField" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "section" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT,
    "valueEncrypted" TEXT,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT,
    "expiresAt" DATE,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedByEmail" TEXT,

    CONSTRAINT "CompanyInfoField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyInfoAccessLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,

    CONSTRAINT "CompanyInfoAccessLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CompanyInfoField_section_sortOrder_idx" ON "CompanyInfoField"("section", "sortOrder");
CREATE INDEX "CompanyInfoAccessLog_targetType_targetId_idx" ON "CompanyInfoAccessLog"("targetType", "targetId");
CREATE INDEX "CompanyInfoAccessLog_createdAt_idx" ON "CompanyInfoAccessLog"("createdAt");

-- Starter rows from the General information sheet, values left empty to fill in by hand
INSERT INTO "CompanyInfoField" ("id", "updatedAt", "section", "label", "sensitive", "sortOrder") VALUES
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'COMPANY', 'Company name', false, 0),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'COMPANY', 'Company address', false, 10),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'COMPANY', 'Website', false, 20),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'COMPANY', 'Cell', false, 30),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'COMPANY', 'Year founded', false, 40),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'COMPANY', 'Date incorporated', false, 50),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'COMPANY', 'Subsidiary of a parent company', false, 60),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'COMPANY', 'Company van', false, 70),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'OWNERSHIP', 'Owner', false, 0),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'OWNERSHIP', 'Owner', false, 10),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'FEDERAL_IDS', 'EIN (Federal)', true, 0),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'FEDERAL_IDS', 'Unique Entity ID (UEI)', false, 10),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'FEDERAL_IDS', 'CAGE code', false, 20),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'FEDERAL_IDS', 'DUNS (Dun & Bradstreet)', false, 30),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'FEDERAL_IDS', 'SAM.gov', false, 40),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'FEDERAL_IDS', 'Supplier ID', false, 50),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'FEDERAL_IDS', 'Labor workforce', false, 60),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'CODES', 'NAICS code', false, 0),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'CODES', 'NAICS code', false, 10),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'CODES', 'NAICS code', false, 20),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'CODES', 'UNSPSC code', false, 30),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'CODES', 'UNSPSC code', false, 40),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'STATE_LOCAL_IDS', 'BIRT (Philadelphia)', false, 0),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'STATE_LOCAL_IDS', 'PHL TIN', true, 10),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'STATE_LOCAL_IDS', 'NJ ID', false, 20),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'STATE_LOCAL_IDS', 'NJ business entity ID', false, 30),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'STATE_LOCAL_IDS', 'NJ Tax ID', true, 40),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'STATE_LOCAL_IDS', 'CAL #', false, 50),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'LICENSES', 'Bristol Township contractor registration', false, 0),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'LICENSES', 'Caln Township contractor license', false, 10),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'LICENSES', 'PA Home Improvement Contractor', false, 20),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'LICENSES', 'Philadelphia contractor license', false, 30),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'LICENSES', 'Commonwealth (PA background checks)', false, 40),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'CERTIFICATIONS', 'MBE', false, 0),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'CERTIFICATIONS', 'WBE', false, 10),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'CERTIFICATIONS', 'OSHA 300A form', false, 20),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'CERTIFICATIONS', 'OSHA card', false, 30),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'CAPABILITIES', 'Type of work', false, 0),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'CAPABILITIES', 'Markets we serve', false, 10),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'CAPABILITIES', 'Regions we serve', false, 20),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'CAPABILITIES', 'Union affiliations', false, 30),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'CAPABILITIES', 'References', false, 40),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'DOCUMENTS', 'SOV (schedule of values)', false, 0),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'DOCUMENTS', 'COI', false, 10),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'DOCUMENTS', 'Insurance limits', false, 20),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'DOCUMENTS', 'Workers compensation', false, 30);
