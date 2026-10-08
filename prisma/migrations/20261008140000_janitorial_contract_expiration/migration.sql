-- Yearly term on janitorial contracts, shown on the Management calendar.
-- Left empty on existing contracts: their start dates were entered late, so staff set the real dates.
ALTER TABLE "RecurringContract" ADD COLUMN "expirationDate" TIMESTAMP(3);

-- The category now holds starts and expirations too, not just end dates.
UPDATE "ManagementCategory"
SET "name" = 'Janitorial contracts', "updatedAt" = CURRENT_TIMESTAMP
WHERE "builtinKey" = 'JANITORIAL_CONTRACTS' AND "name" = 'Janitorial contracts ending';
