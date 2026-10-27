-- QuickBooks reports brought into the ERP (CSV uploads now, API sync later): imports, P&L lines by month, A/R aging rows.
CREATE TABLE "QboImport" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'UPLOAD',
    "fileName" TEXT,
    "importedBy" TEXT,
    "periodFrom" TEXT,
    "periodTo" TEXT,
    "basis" TEXT,
    "asOf" TEXT,
    "rowCount" INTEGER NOT NULL,
    CONSTRAINT "QboImport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "QboImport_kind_createdAt_idx" ON "QboImport"("kind", "createdAt");

CREATE TABLE "QboPnlLine" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "parent" TEXT NOT NULL DEFAULT '',
    "section" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    CONSTRAINT "QboPnlLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QboPnlLine_month_section_parent_account_key" ON "QboPnlLine"("month", "section", "parent", "account");
CREATE INDEX "QboPnlLine_importId_idx" ON "QboPnlLine"("importId");
ALTER TABLE "QboPnlLine" ADD CONSTRAINT "QboPnlLine_importId_fkey" FOREIGN KEY ("importId") REFERENCES "QboImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "QboArRow" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "asOf" TEXT NOT NULL,
    "customer" TEXT NOT NULL,
    "parent" TEXT NOT NULL DEFAULT '',
    "currentCents" INTEGER NOT NULL,
    "days1to30Cents" INTEGER NOT NULL,
    "days31to60Cents" INTEGER NOT NULL,
    "days61to90Cents" INTEGER NOT NULL,
    "over90Cents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    CONSTRAINT "QboArRow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QboArRow_asOf_parent_customer_key" ON "QboArRow"("asOf", "parent", "customer");
CREATE INDEX "QboArRow_importId_idx" ON "QboArRow"("importId");
ALTER TABLE "QboArRow" ADD CONSTRAINT "QboArRow_importId_fkey" FOREIGN KEY ("importId") REFERENCES "QboImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
