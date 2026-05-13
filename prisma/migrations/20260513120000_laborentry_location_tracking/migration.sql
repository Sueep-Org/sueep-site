-- Add location tracking fields to LaborEntry
ALTER TABLE "LaborEntry" ADD COLUMN "locationLatitude" DOUBLE PRECISION,
ADD COLUMN "locationLongitude" DOUBLE PRECISION,
ADD COLUMN "locationAccuracy" DOUBLE PRECISION,
ADD COLUMN "lastLocationAt" TIMESTAMP(3);
