-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "statusSource" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "statusChangedAt" TIMESTAMP(3);
