-- Key areas per janitorial contract, and what a quality check visit found.
ALTER TABLE "RecurringContract" ADD COLUMN "qualityAreas" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "JanitorialQualityCheck" ADD COLUMN "areaResults" JSONB,
ADD COLUMN "propertyManagerName" TEXT,
ADD COLUMN "propertyManagerNotes" TEXT,
ADD COLUMN "teamUpdates" TEXT;

CREATE TABLE "JanitorialQualityPhoto" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qualityCheckId" TEXT NOT NULL,
    "area" TEXT,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedBy" TEXT,

    CONSTRAINT "JanitorialQualityPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JanitorialQualityPhoto_qualityCheckId_idx" ON "JanitorialQualityPhoto"("qualityCheckId");

ALTER TABLE "JanitorialQualityPhoto" ADD CONSTRAINT "JanitorialQualityPhoto_qualityCheckId_fkey" FOREIGN KEY ("qualityCheckId") REFERENCES "JanitorialQualityCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
