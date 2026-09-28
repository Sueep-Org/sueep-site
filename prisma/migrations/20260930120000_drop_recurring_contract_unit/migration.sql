-- The per-unit list on recurring contracts was replaced by
-- RecurringContract.serviceAreas. Verified empty (0 rows) and unreferenced
-- before removal. Must deploy together with the code that stopped reading it.

-- DropForeignKey
ALTER TABLE "RecurringContractUnit" DROP CONSTRAINT "RecurringContractUnit_recurringContractId_fkey";

-- DropTable
DROP TABLE "RecurringContractUnit";
