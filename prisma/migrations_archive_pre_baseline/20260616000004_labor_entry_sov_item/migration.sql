ALTER TABLE "LaborEntry" ADD COLUMN IF NOT EXISTS "sovItemId" TEXT;

ALTER TABLE "LaborEntry" ADD CONSTRAINT "LaborEntry_sovItemId_fkey"
  FOREIGN KEY ("sovItemId") REFERENCES "ProjectSOVItem"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "LaborEntry_sovItemId_idx" ON "LaborEntry"("sovItemId");
