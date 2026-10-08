-- CreateTable
CREATE TABLE "InsuranceContact" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,

    CONSTRAINT "InsuranceContact_pkey" PRIMARY KEY ("id")
);

-- Company Info expirations on the Management calendar, filled from CompanyInfoField.expiresAt.
INSERT INTO "ManagementCategory" ("id", "updatedAt", "builtinKey", "name", "color", "remindDays", "sortOrder")
VALUES ('mgmtcat_company_info', CURRENT_TIMESTAMP, 'COMPANY_INFO', 'Company licenses and IDs', 'emerald', ARRAY[30,7], 11)
ON CONFLICT DO NOTHING;
