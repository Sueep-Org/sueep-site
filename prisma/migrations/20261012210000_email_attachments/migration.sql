-- Files sent with an email written on a project's Communications tab, kept with the Email Log row.
CREATE TABLE "EmailAttachment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailLogId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "EmailAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailAttachment_emailLogId_idx" ON "EmailAttachment"("emailLogId");

ALTER TABLE "EmailAttachment" ADD CONSTRAINT "EmailAttachment_emailLogId_fkey" FOREIGN KEY ("emailLogId") REFERENCES "EmailLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
