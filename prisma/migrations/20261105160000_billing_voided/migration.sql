-- Voided billing status: why a line was voided (billingStatus = 'VOIDED')
ALTER TABLE "Project" ADD COLUMN "voidReason" TEXT;
ALTER TABLE "TurnoverRequest" ADD COLUMN "voidReason" TEXT;
ALTER TABLE "RecurringContractPeriod" ADD COLUMN "voidReason" TEXT;
ALTER TABLE "ProjectChangeOrder" ADD COLUMN "voidReason" TEXT;
ALTER TABLE "ProjectSOVItem" ADD COLUMN "voidReason" TEXT;
