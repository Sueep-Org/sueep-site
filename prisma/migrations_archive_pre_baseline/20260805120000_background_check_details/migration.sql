-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "backgroundCheckedAt" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN "backgroundCheckExpiresAt" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN "backgroundCheckProvider" TEXT;
ALTER TABLE "Employee" ADD COLUMN "backgroundCheckNotes" TEXT;
