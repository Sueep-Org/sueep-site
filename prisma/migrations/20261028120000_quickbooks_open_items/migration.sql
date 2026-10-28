-- What's still open in QuickBooks (unpaid invoices, unapplied payments, unused credit memos), for the QuickBooks check page.
CREATE TABLE "QboOpenItem" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "qboId" TEXT NOT NULL,
    "docNumber" TEXT,
    "customer" TEXT NOT NULL,
    "txnDate" TEXT,
    "dueDate" TEXT,
    "totalCents" INTEGER NOT NULL,
    "openCents" INTEGER NOT NULL,
    CONSTRAINT "QboOpenItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QboOpenItem_kind_qboId_key" ON "QboOpenItem"("kind", "qboId");
CREATE INDEX "QboOpenItem_docNumber_idx" ON "QboOpenItem"("docNumber");
CREATE INDEX "QboOpenItem_importId_idx" ON "QboOpenItem"("importId");
ALTER TABLE "QboOpenItem" ADD CONSTRAINT "QboOpenItem_importId_fkey" FOREIGN KEY ("importId") REFERENCES "QboImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
