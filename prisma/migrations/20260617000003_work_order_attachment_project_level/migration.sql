DROP TABLE IF EXISTS "ProjectWorkOrderAttachment";

CREATE TABLE "ProjectWorkOrderAttachment" (
  "id"        TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "projectId" TEXT NOT NULL,
  "filename"  TEXT NOT NULL,
  "mimeType"  TEXT NOT NULL,
  "size"      INTEGER NOT NULL,
  "data"      BYTEA NOT NULL,
  CONSTRAINT "ProjectWorkOrderAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProjectWorkOrderAttachment_projectId_idx" ON "ProjectWorkOrderAttachment"("projectId");

ALTER TABLE "ProjectWorkOrderAttachment"
  ADD CONSTRAINT "ProjectWorkOrderAttachment_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
