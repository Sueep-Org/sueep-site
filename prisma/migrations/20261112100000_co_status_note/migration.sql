-- AlterTable
ALTER TABLE "ProjectChangeOrder" ADD COLUMN "statusNote" TEXT,
ADD COLUMN "statusNoteBy" TEXT,
ADD COLUMN "statusNoteAt" TIMESTAMP(3);
