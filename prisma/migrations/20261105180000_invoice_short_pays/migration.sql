-- Why a client paid less than the invoice (INVOICE_TRACKING_PLAN.md Phase 6)
CREATE TABLE "InvoiceShortPay" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amountCents" INTEGER,
    "note" TEXT,
    "byEmail" TEXT NOT NULL,

    CONSTRAINT "InvoiceShortPay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvoiceShortPay_invoiceNumber_key" ON "InvoiceShortPay"("invoiceNumber");
