-- AlterTable: add binary file storage to EmployeeDocument
ALTER TABLE "EmployeeDocument"
  ADD COLUMN "fileData"     BYTEA,
  ADD COLUMN "fileMimeType" TEXT,
  ADD COLUMN "fileFilename" TEXT;
