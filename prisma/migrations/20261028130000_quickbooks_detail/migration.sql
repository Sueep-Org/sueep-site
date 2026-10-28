-- QuickBooks detail for the QuickBooks check drill-downs: P&L transactions, invoices, and payments with the invoices they paid.
CREATE TABLE "QboPnlTxn" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "parent" TEXT NOT NULL DEFAULT '',
    "txnType" TEXT NOT NULL,
    "txnId" TEXT,
    "docNum" TEXT,
    "name" TEXT,
    "memo" TEXT,
    "amountCents" INTEGER NOT NULL,
    CONSTRAINT "QboPnlTxn_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "QboPnlTxn_month_section_idx" ON "QboPnlTxn"("month", "section");
CREATE INDEX "QboPnlTxn_docNum_idx" ON "QboPnlTxn"("docNum");
CREATE INDEX "QboPnlTxn_importId_idx" ON "QboPnlTxn"("importId");
ALTER TABLE "QboPnlTxn" ADD CONSTRAINT "QboPnlTxn_importId_fkey" FOREIGN KEY ("importId") REFERENCES "QboImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "QboInvoice" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "qboId" TEXT NOT NULL,
    "docNumber" TEXT,
    "customer" TEXT NOT NULL,
    "txnDate" TEXT,
    "dueDate" TEXT,
    "totalCents" INTEGER NOT NULL,
    "balanceCents" INTEGER NOT NULL,
    CONSTRAINT "QboInvoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QboInvoice_qboId_key" ON "QboInvoice"("qboId");
CREATE INDEX "QboInvoice_docNumber_idx" ON "QboInvoice"("docNumber");
CREATE INDEX "QboInvoice_importId_idx" ON "QboInvoice"("importId");
ALTER TABLE "QboInvoice" ADD CONSTRAINT "QboInvoice_importId_fkey" FOREIGN KEY ("importId") REFERENCES "QboImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "QboPayment" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "qboId" TEXT NOT NULL,
    "txnDate" TEXT,
    "customer" TEXT NOT NULL,
    "refNum" TEXT,
    "totalCents" INTEGER NOT NULL,
    "unappliedCents" INTEGER NOT NULL,
    "links" JSONB NOT NULL DEFAULT '[]',
    CONSTRAINT "QboPayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QboPayment_qboId_key" ON "QboPayment"("qboId");
CREATE INDEX "QboPayment_importId_idx" ON "QboPayment"("importId");
ALTER TABLE "QboPayment" ADD CONSTRAINT "QboPayment_importId_fkey" FOREIGN KEY ("importId") REFERENCES "QboImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
