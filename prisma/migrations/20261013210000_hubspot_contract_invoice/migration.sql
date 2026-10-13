-- HubSpot invoices linked by hand to janitorial contract months.
CREATE TABLE "HubSpotContractInvoice" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "periodId" TEXT NOT NULL,
    "hubspotInvoiceId" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "status" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "paidDate" TIMESTAMP(3),
    "amountCents" INTEGER NOT NULL,
    "invoiceTotalCents" INTEGER,
    "balanceDueCents" INTEGER,
    "viewUrl" TEXT,
    "pdfUrl" TEXT,
    "linkedByName" TEXT,
    "paidAppliedAt" TIMESTAMP(3),

    CONSTRAINT "HubSpotContractInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HubSpotContractInvoice_hubspotInvoiceId_periodId_key" ON "HubSpotContractInvoice"("hubspotInvoiceId", "periodId");
CREATE INDEX "HubSpotContractInvoice_periodId_idx" ON "HubSpotContractInvoice"("periodId");

ALTER TABLE "HubSpotContractInvoice" ADD CONSTRAINT "HubSpotContractInvoice_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "RecurringContractPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
