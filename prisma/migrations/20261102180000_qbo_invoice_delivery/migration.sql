-- ERP sends invoices to QuickBooks, Phase 4: delivery rows for invoices made in QuickBooks. Existing rows keep their HubSpot id.
ALTER TABLE "InvoiceDelivery" ALTER COLUMN "hubspotInvoiceId" DROP NOT NULL;
ALTER TABLE "InvoiceDelivery" ADD COLUMN "qboInvoiceId" TEXT;
ALTER TABLE "InvoiceDelivery" ADD COLUMN "lines" JSONB;
ALTER TABLE "InvoiceDelivery" ADD COLUMN "dueDate" TIMESTAMP(3);
CREATE UNIQUE INDEX "InvoiceDelivery_qboInvoiceId_key" ON "InvoiceDelivery"("qboInvoiceId");
