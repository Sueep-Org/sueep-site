-- Follow-up log on unpaid invoices (INVOICE_TRACKING_PLAN.md Phase 4)
CREATE TABLE "InvoiceFollowUp" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiceNumber" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "contactName" TEXT,
    "note" TEXT NOT NULL,
    "promisedDate" DATE,
    "byEmail" TEXT NOT NULL,

    CONSTRAINT "InvoiceFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InvoiceFollowUp_invoiceNumber_idx" ON "InvoiceFollowUp"("invoiceNumber");
