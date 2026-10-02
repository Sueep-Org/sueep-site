-- CreateTable
CREATE TABLE "InsurancePolicy" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "policyType" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "policyNumber" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "eachOccurrenceCents" INTEGER,
    "aggregateCents" INTEGER,
    "aggregatePerProject" BOOLEAN NOT NULL DEFAULT false,
    "otherLimits" TEXT,
    "blanketAdditionalInsured" BOOLEAN NOT NULL DEFAULT false,
    "waiverOfSubrogation" BOOLEAN NOT NULL DEFAULT false,
    "primaryNoncontributory" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "InsurancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoiHolder" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "address" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "reqGlOccurrenceCents" INTEGER,
    "reqGlAggregateCents" INTEGER,
    "reqAutoCents" INTEGER,
    "reqUmbrellaCents" INTEGER,
    "reqWcEmployersLiabilityCents" INTEGER,
    "requiresAdditionalInsured" BOOLEAN NOT NULL DEFAULT false,
    "requiresWaiverOfSubrogation" BOOLEAN NOT NULL DEFAULT false,
    "requiresPrimaryNoncontributory" BOOLEAN NOT NULL DEFAULT false,
    "additionalInsureds" TEXT,
    "specialWording" TEXT,
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CoiHolder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InsurancePolicy_active_expiresAt_idx" ON "InsurancePolicy"("active", "expiresAt");

-- CreateIndex
CREATE INDEX "CoiHolder_archived_name_idx" ON "CoiHolder"("archived", "name");

