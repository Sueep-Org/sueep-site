-- When a linked HubSpot invoice moved its line to Billed (applyPaidLinks.ts).
ALTER TABLE "HubSpotSovInvoice" ADD COLUMN "billedAppliedAt" TIMESTAMP(3);
ALTER TABLE "HubSpotUnitInvoice" ADD COLUMN "billedAppliedAt" TIMESTAMP(3);
