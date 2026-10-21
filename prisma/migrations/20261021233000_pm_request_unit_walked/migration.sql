-- Property manager requests: has the unit been walked. Additive only, older requests stay null (not asked).

-- AlterTable
ALTER TABLE "PropertyManagerRequest" ADD COLUMN "unitWalked" BOOLEAN;
