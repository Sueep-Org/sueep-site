-- Manual invoice links on turns, and the project-side invoice mirror.
ALTER TABLE "HubSpotUnitInvoice" ADD COLUMN "manual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "HubSpotUnitInvoice" ADD COLUMN "linkedByName" TEXT;

CREATE TABLE "HubSpotSovInvoice" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "sovItemId" TEXT,
    "changeOrderId" TEXT,
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
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "linkedByName" TEXT,

    CONSTRAINT "HubSpotSovInvoice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HubSpotSovInvoice_projectId_idx" ON "HubSpotSovInvoice"("projectId");
CREATE INDEX "HubSpotSovInvoice_hubspotInvoiceId_idx" ON "HubSpotSovInvoice"("hubspotInvoiceId");
CREATE INDEX "HubSpotSovInvoice_sovItemId_idx" ON "HubSpotSovInvoice"("sovItemId");
CREATE INDEX "HubSpotSovInvoice_changeOrderId_idx" ON "HubSpotSovInvoice"("changeOrderId");

ALTER TABLE "HubSpotSovInvoice" ADD CONSTRAINT "HubSpotSovInvoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HubSpotSovInvoice" ADD CONSTRAINT "HubSpotSovInvoice_sovItemId_fkey" FOREIGN KEY ("sovItemId") REFERENCES "ProjectSOVItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HubSpotSovInvoice" ADD CONSTRAINT "HubSpotSovInvoice_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ProjectChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
