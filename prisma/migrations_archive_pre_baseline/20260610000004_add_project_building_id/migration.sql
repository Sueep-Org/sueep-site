ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "buildingId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Project_buildingId_fkey'
  ) THEN
    ALTER TABLE "Project" ADD CONSTRAINT "Project_buildingId_fkey"
      FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Project_buildingId_idx" ON "Project"("buildingId");
