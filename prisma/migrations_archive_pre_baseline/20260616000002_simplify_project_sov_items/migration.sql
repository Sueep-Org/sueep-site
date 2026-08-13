-- Drop AIA-specific columns no longer needed
ALTER TABLE "ProjectSOVItem" DROP COLUMN IF EXISTS "itemNo";
ALTER TABLE "ProjectSOVItem" DROP COLUMN IF EXISTS "costCode";
ALTER TABLE "ProjectSOVItem" DROP COLUMN IF EXISTS "previousCompletedCents";
ALTER TABLE "ProjectSOVItem" DROP COLUMN IF EXISTS "thisPeriodCents";
ALTER TABLE "ProjectSOVItem" DROP COLUMN IF EXISTS "materialsStoredCents";
ALTER TABLE "ProjectSOVItem" DROP COLUMN IF EXISTS "retainageCents";

-- Add completed flag
ALTER TABLE "ProjectSOVItem" ADD COLUMN IF NOT EXISTS "completed" BOOLEAN NOT NULL DEFAULT false;
