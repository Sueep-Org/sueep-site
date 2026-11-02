-- ERP sends invoices to QuickBooks, Phase 3: invoices drafted in the ERP, created in QuickBooks on Approve. New table only.
CREATE TABLE "QboInvoiceDraft" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "environment" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "periodId" TEXT,
    "groupType" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "lines" JSONB NOT NULL DEFAULT '[]',
    "totalCents" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdByEmail" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedByEmail" TEXT,
    "discardedAt" TIMESTAMP(3),
    "discardedByEmail" TEXT,
    "qboInvoiceId" TEXT,
    "invoiceNumber" TEXT,
    "qboCustomerId" TEXT,

    CONSTRAINT "QboInvoiceDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QboInvoiceDraft_environment_status_idx" ON "QboInvoiceDraft"("environment", "status");
CREATE INDEX "QboInvoiceDraft_periodId_idx" ON "QboInvoiceDraft"("periodId");
-- Never two live drafts for one month (daily run and Draft now racing).
CREATE UNIQUE INDEX "QboInvoiceDraft_one_per_month" ON "QboInvoiceDraft"("environment", "periodId") WHERE "status" IN ('DRAFT', 'APPROVED');

ALTER TABLE "QboInvoiceDraft" ADD CONSTRAINT "QboInvoiceDraft_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "RecurringContractPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
