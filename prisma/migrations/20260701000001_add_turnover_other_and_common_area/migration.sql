-- AlterTable
ALTER TABLE "TurnoverRequest" ADD COLUMN "otherWork" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TurnoverRequest" ADD COLUMN "otherDescription" TEXT;
ALTER TABLE "TurnoverRequest" ADD COLUMN "otherCents" INTEGER;
