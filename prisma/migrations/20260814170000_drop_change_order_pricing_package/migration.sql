-- DropForeignKey
ALTER TABLE "ChangeOrderPricingPackage" DROP CONSTRAINT IF EXISTS "ChangeOrderPricingPackage_createdByUserId_fkey";

-- DropTable
-- Table was empty (0 rows) at time of removal — feature was never wired up
-- to actually apply a package to a change order, just previewed a price.
DROP TABLE "ChangeOrderPricingPackage";
