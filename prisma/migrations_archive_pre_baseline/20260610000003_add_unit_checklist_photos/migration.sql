-- CreateTable
CREATE TABLE IF NOT EXISTS "UnitChecklistPhoto" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checklistId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "photoType" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    CONSTRAINT "UnitChecklistPhoto_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UnitChecklistPhoto_checklistId_fkey'
  ) THEN
    ALTER TABLE "UnitChecklistPhoto" ADD CONSTRAINT "UnitChecklistPhoto_checklistId_fkey"
      FOREIGN KEY ("checklistId") REFERENCES "UnitTurnoverChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
