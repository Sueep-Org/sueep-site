-- AlterTable: add completed to ProjectChangeOrderLaborer
ALTER TABLE "ProjectChangeOrderLaborer" ADD COLUMN "completed" BOOLEAN NOT NULL DEFAULT false;
