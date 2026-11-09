-- Sub portal (/sub/[token]): link, sign-in code, remembered devices, email sign-in buttons
ALTER TABLE "Contractor" ADD COLUMN "portalToken" TEXT;
ALTER TABLE "Contractor" ADD COLUMN "portalLastSeenAt" TIMESTAMP(3);
ALTER TABLE "Contractor" ADD COLUMN "portalCodeHash" TEXT;
ALTER TABLE "Contractor" ADD COLUMN "portalCodeExpiresAt" TIMESTAMP(3);
ALTER TABLE "Contractor" ADD COLUMN "portalCodeSentAt" TIMESTAMP(3);
ALTER TABLE "Contractor" ADD COLUMN "portalCodeAttempts" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "Contractor_portalToken_key" ON "Contractor"("portalToken");

CREATE TABLE "ContractorPortalDevice" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contractorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    CONSTRAINT "ContractorPortalDevice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContractorPortalDevice_tokenHash_key" ON "ContractorPortalDevice"("tokenHash");
CREATE INDEX "ContractorPortalDevice_contractorId_idx" ON "ContractorPortalDevice"("contractorId");
ALTER TABLE "ContractorPortalDevice" ADD CONSTRAINT "ContractorPortalDevice_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ContractorPortalSignInLink" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contractorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContractorPortalSignInLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContractorPortalSignInLink_tokenHash_key" ON "ContractorPortalSignInLink"("tokenHash");
CREATE INDEX "ContractorPortalSignInLink_contractorId_idx" ON "ContractorPortalSignInLink"("contractorId");
ALTER TABLE "ContractorPortalSignInLink" ADD CONSTRAINT "ContractorPortalSignInLink_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
