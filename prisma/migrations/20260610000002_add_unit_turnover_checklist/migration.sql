-- CreateTable
CREATE TABLE IF NOT EXISTS "UnitTurnoverChecklist" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "propertyName" TEXT,
    "unitNumber" TEXT,
    "checklistDate" TEXT,
    "technicianNames" TEXT,
    "startTime" TEXT,
    "endTime" TEXT,
    "photoBefore" BOOLEAN NOT NULL DEFAULT false,
    "photoAfter" BOOLEAN NOT NULL DEFAULT false,
    "conditionScore" INTEGER,
    "issues" TEXT,
    "addlPaintTouchUp" BOOLEAN NOT NULL DEFAULT false,
    "addlFullRepaint" BOOLEAN NOT NULL DEFAULT false,
    "addlCarpetCleaning" BOOLEAN NOT NULL DEFAULT false,
    "addlMaintenanceRepair" BOOLEAN NOT NULL DEFAULT false,
    "addlTrashOut" BOOLEAN NOT NULL DEFAULT false,
    "technicianSignature" TEXT,
    "supervisorSignature" TEXT,
    "sectionPhotos" JSONB NOT NULL DEFAULT '{}',
    "completedItems" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "UnitTurnoverChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UnitTurnoverChecklist_projectId_key" ON "UnitTurnoverChecklist"("projectId");

-- AddForeignKey (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UnitTurnoverChecklist_projectId_fkey'
  ) THEN
    ALTER TABLE "UnitTurnoverChecklist" ADD CONSTRAINT "UnitTurnoverChecklist_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
