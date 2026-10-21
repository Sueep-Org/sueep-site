-- Email language for employees and contractors ("en" or "es"). Additive only, everyone starts on English.

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE "Contractor" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';
