-- Auto-drafted janitorial invoices (Ready to send). Additive only.

-- AlterTable
ALTER TABLE "RecurringContract" ADD COLUMN     "autoDraftInvoices" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "invoiceLabel" TEXT;

-- AlterTable
ALTER TABLE "RecurringContractPeriod" ADD COLUMN     "draftDiscardedAt" TIMESTAMP(3),
ADD COLUMN     "draftDiscardedByEmail" TEXT,
ADD COLUMN     "draftError" TEXT,
ADD COLUMN     "draftErrorAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "HubSpotContractInvoice" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedByEmail" TEXT,
ADD COLUMN     "draftedByErp" BOOLEAN NOT NULL DEFAULT false;

