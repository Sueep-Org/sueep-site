-- AlterTable
ALTER TABLE "Contractor" ADD COLUMN     "autoExpiresAt" TIMESTAMP(3),
ADD COLUMN     "autoLimitCents" INTEGER,
ADD COLUMN     "coiReviewedAt" TIMESTAMP(3),
ADD COLUMN     "coiReviewedBy" TEXT,
ADD COLUMN     "glAggregateCents" INTEGER,
ADD COLUMN     "glCarrier" TEXT,
ADD COLUMN     "glExpiresAt" TIMESTAMP(3),
ADD COLUMN     "glOccurrenceCents" INTEGER,
ADD COLUMN     "glPolicyNumber" TEXT,
ADD COLUMN     "sueepAdditionalInsured" BOOLEAN,
ADD COLUMN     "sueepPrimaryNoncontributory" BOOLEAN,
ADD COLUMN     "sueepWaiverOfSubrogation" BOOLEAN,
ADD COLUMN     "umbrellaExpiresAt" TIMESTAMP(3),
ADD COLUMN     "umbrellaLimitCents" INTEGER,
ADD COLUMN     "workersCompExempt" BOOLEAN NOT NULL DEFAULT false;

