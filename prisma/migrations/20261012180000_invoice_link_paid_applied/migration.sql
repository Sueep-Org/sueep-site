-- When the sync marked a line Paid from this invoice, so it only does that once and a status someone sets afterwards is left alone.
ALTER TABLE "HubSpotSovInvoice" ADD COLUMN "paidAppliedAt" TIMESTAMP(3);
ALTER TABLE "HubSpotUnitInvoice" ADD COLUMN "paidAppliedAt" TIMESTAMP(3);
