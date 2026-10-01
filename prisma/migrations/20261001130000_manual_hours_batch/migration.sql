-- Groups the days of one manual hours date range.
ALTER TABLE "ManualHoursEntry" ADD COLUMN "batchId" TEXT;
CREATE INDEX "ManualHoursEntry_batchId_idx" ON "ManualHoursEntry"("batchId");
