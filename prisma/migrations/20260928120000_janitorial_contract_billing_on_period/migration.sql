-- AlterTable
ALTER TABLE "RecurringContract" ADD COLUMN     "serviceAreas" TEXT;

-- AlterTable
-- amountCents is added nullable, backfilled, then made NOT NULL so existing
-- periods keep their real amount instead of a placeholder default.
ALTER TABLE "RecurringContractPeriod" ADD COLUMN     "amountCents" INTEGER,
ADD COLUMN     "billingStatus" TEXT NOT NULL DEFAULT 'NOT_BILLED',
ALTER COLUMN "billingProjectId" DROP NOT NULL;

-- Backfill: periods that still have their billing Project take its amount
-- and billing status (INVOICE_PAID/BILLING are the Project-side spellings).
UPDATE "RecurringContractPeriod" AS period
SET "amountCents" = COALESCE(project."contractValueCents", contract."monthlyRateCents"),
    "billingStatus" = CASE
      WHEN project."billingStatus" IN ('PAID', 'INVOICE_PAID') THEN 'PAID'
      WHEN project."billingStatus" IN ('BILLED', 'BILLING') THEN 'BILLED'
      ELSE 'NOT_BILLED'
    END
FROM "RecurringContract" AS contract, "Project" AS project
WHERE contract."id" = period."recurringContractId"
  AND project."id" = period."billingProjectId";

-- Periods whose billing Project no longer exists fall back to the contract rate.
UPDATE "RecurringContractPeriod" AS period
SET "amountCents" = contract."monthlyRateCents"
FROM "RecurringContract" AS contract
WHERE contract."id" = period."recurringContractId"
  AND period."amountCents" IS NULL;

-- The default only exists so code deployed before this migration (which
-- doesn't set amountCents) can still insert periods without failing.
ALTER TABLE "RecurringContractPeriod" ALTER COLUMN "amountCents" SET NOT NULL,
ALTER COLUMN "amountCents" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "RecurringContractCharge" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,

    CONSTRAINT "RecurringContractCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringContractCharge_periodId_idx" ON "RecurringContractCharge"("periodId");

-- AddForeignKey
ALTER TABLE "RecurringContractCharge" ADD CONSTRAINT "RecurringContractCharge_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "RecurringContractPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
