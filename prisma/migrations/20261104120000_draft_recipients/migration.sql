-- Recipients set on a waiting draft on Ready to send. Empty with no set date means use the job, building or company billing settings. Adds columns only.
ALTER TABLE "QboInvoiceDraft" ADD COLUMN "sendTo" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "QboInvoiceDraft" ADD COLUMN "cc" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "QboInvoiceDraft" ADD COLUMN "recipientsSetAt" TIMESTAMP(3);
ALTER TABLE "QboInvoiceDraft" ADD COLUMN "recipientsSetByEmail" TEXT;

ALTER TABLE "ItemInvoiceDraft" ADD COLUMN "sendTo" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ItemInvoiceDraft" ADD COLUMN "cc" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ItemInvoiceDraft" ADD COLUMN "recipientsSetAt" TIMESTAMP(3);
ALTER TABLE "ItemInvoiceDraft" ADD COLUMN "recipientsSetByEmail" TEXT;

ALTER TABLE "RecurringContractPeriod" ADD COLUMN "draftSendTo" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "RecurringContractPeriod" ADD COLUMN "draftCc" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "RecurringContractPeriod" ADD COLUMN "draftRecipientsSetAt" TIMESTAMP(3);
ALTER TABLE "RecurringContractPeriod" ADD COLUMN "draftRecipientsSetByEmail" TEXT;
