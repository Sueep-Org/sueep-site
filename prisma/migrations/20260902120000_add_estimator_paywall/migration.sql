-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "freeTrialPagesUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "planTier" TEXT NOT NULL DEFAULT 'FREE',
ADD COLUMN     "seatLimit" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "stripeBillingInterval" TEXT,
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "stripeSubscriptionStatus" TEXT;

-- CreateTable
CREATE TABLE "EstimatorUsageEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstimatorUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_stripeCustomerId_key" ON "Company"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_stripeSubscriptionId_key" ON "Company"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "EstimatorUsageEvent_companyId_kind_createdAt_idx" ON "EstimatorUsageEvent"("companyId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "EstimatorUsageEvent_userId_kind_createdAt_idx" ON "EstimatorUsageEvent"("userId", "kind", "createdAt");

-- AddForeignKey
ALTER TABLE "EstimatorUsageEvent" ADD CONSTRAINT "EstimatorUsageEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
