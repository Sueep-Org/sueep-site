-- Make requestedDate nullable and clear existing values
ALTER TABLE "ProjectChangeOrder" ALTER COLUMN "requestedDate" DROP NOT NULL;
UPDATE "ProjectChangeOrder" SET "requestedDate" = NULL;
