CREATE TABLE IF NOT EXISTS "ProjectWorkOrderAttachment" (
  "id"          TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "workOrderId" TEXT NOT NULL,
  "filename"    TEXT NOT NULL,
  "mimeType"    TEXT NOT NULL,
  "size"        INTEGER NOT NULL,
  "data"        BYTEA NOT NULL,
  CONSTRAINT "ProjectWorkOrderAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProjectWorkOrderAttachment_workOrderId_idx" ON "ProjectWorkOrderAttachment"("workOrderId");

ALTER TABLE "ProjectWorkOrderAttachment"
  ADD CONSTRAINT "ProjectWorkOrderAttachment_workOrderId_fkey"
  FOREIGN KEY ("workOrderId") REFERENCES "ProjectWorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
