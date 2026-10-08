-- AlterTable
ALTER TABLE "InsurancePolicy" ADD COLUMN     "auditAdjustmentCents" INTEGER,
ADD COLUMN     "auditDate" TIMESTAMP(3),
ADD COLUMN     "cancelledOn" TIMESTAMP(3),
ADD COLUMN     "premiumCents" INTEGER;

-- CreateTable
CREATE TABLE "InsurancePolicyTerm" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "policyId" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "premiumCents" INTEGER,
    "auditAdjustmentCents" INTEGER,
    "auditDate" TIMESTAMP(3),
    "cancelledOn" TIMESTAMP(3),

    CONSTRAINT "InsurancePolicyTerm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InsurancePolicyTerm_policyId_idx" ON "InsurancePolicyTerm"("policyId");

-- AddForeignKey
ALTER TABLE "InsurancePolicyTerm" ADD CONSTRAINT "InsurancePolicyTerm_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "InsurancePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
