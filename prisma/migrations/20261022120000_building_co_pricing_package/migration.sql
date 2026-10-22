-- Change order pricing package per building. Additive only, null means the building uses the default package.

-- AlterTable
ALTER TABLE "Building" ADD COLUMN "coPricingPackage" JSONB;
