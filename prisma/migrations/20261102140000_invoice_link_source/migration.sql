-- ERP sends invoices to QuickBooks, Phase 2: invoice links say which system the invoice is in. Existing rows are all HubSpot.
ALTER TABLE "HubSpotUnitInvoice" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'HUBSPOT';
ALTER TABLE "HubSpotUnitInvoice" ADD COLUMN "qboInvoiceId" TEXT;
ALTER TABLE "HubSpotUnitInvoice" ALTER COLUMN "hubspotInvoiceId" DROP NOT NULL;
CREATE UNIQUE INDEX "HubSpotUnitInvoice_qboInvoiceId_unitNumber_key" ON "HubSpotUnitInvoice"("qboInvoiceId", "unitNumber");

ALTER TABLE "HubSpotSovInvoice" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'HUBSPOT';
ALTER TABLE "HubSpotSovInvoice" ADD COLUMN "qboInvoiceId" TEXT;
ALTER TABLE "HubSpotSovInvoice" ALTER COLUMN "hubspotInvoiceId" DROP NOT NULL;
CREATE INDEX "HubSpotSovInvoice_qboInvoiceId_idx" ON "HubSpotSovInvoice"("qboInvoiceId");

ALTER TABLE "HubSpotContractInvoice" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'HUBSPOT';
ALTER TABLE "HubSpotContractInvoice" ADD COLUMN "qboInvoiceId" TEXT;
ALTER TABLE "HubSpotContractInvoice" ALTER COLUMN "hubspotInvoiceId" DROP NOT NULL;
CREATE UNIQUE INDEX "HubSpotContractInvoice_qboInvoiceId_periodId_key" ON "HubSpotContractInvoice"("qboInvoiceId", "periodId");
