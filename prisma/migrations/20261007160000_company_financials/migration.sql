-- CreateTable
CREATE TABLE "CompanyFinancialYear" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "year" INTEGER NOT NULL,
    "annualVolumeCents" BIGINT,
    "comment" TEXT,
    "updatedByEmail" TEXT,

    CONSTRAINT "CompanyFinancialYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyDocument" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "year" INTEGER,
    "label" TEXT NOT NULL,
    "linkUrl" TEXT,
    "filename" TEXT,
    "mimeType" TEXT,
    "size" INTEGER,
    "data" BYTEA,
    "uploadedByEmail" TEXT,

    CONSTRAINT "CompanyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyFinancialYear_year_key" ON "CompanyFinancialYear"("year");

-- CreateIndex
CREATE INDEX "CompanyDocument_kind_year_idx" ON "CompanyDocument"("kind", "year");

-- Starter rows from the Financial sheet, values left empty to fill in by hand
INSERT INTO "CompanyFinancialYear" ("id", "updatedAt", "year") VALUES
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 2021),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 2022),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 2023);

INSERT INTO "CompanyInfoField" ("id", "updatedAt", "section", "label", "sensitive", "sortOrder") VALUES
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'FINANCIAL_OVERVIEW', 'Preferred project size', false, 0),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'FINANCIAL_OVERVIEW', 'Number of employees', false, 10),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'FINANCIAL_OVERVIEW', 'W2 employees', false, 20),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'FINANCIAL_OVERVIEW', '1099 contractors', false, 30),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'BANKING', 'Bank name and location', false, 0),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'BANKING', 'Routing number', true, 10),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'BANKING', 'Checking account', true, 20),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'BANKING', 'Bank contact', false, 30),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'BANKING', 'Total line of credit', false, 40),
  (gen_random_uuid()::text, CURRENT_TIMESTAMP, 'BANKING', 'Available line of credit', false, 50);
