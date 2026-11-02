-- ERP sends invoices to QuickBooks, Phase 1 (mapping): QuickBooks customers and products from the sync, and each client company's QuickBooks customer.
ALTER TABLE "ClientCompany" ADD COLUMN "qboCustomerId" TEXT;
ALTER TABLE "ClientCompany" ADD COLUMN "qboConfirmedAt" TIMESTAMP(3);
ALTER TABLE "ClientCompany" ADD COLUMN "qboConfirmedByEmail" TEXT;

CREATE TABLE "QboCustomer" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "qboId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "fullyQualifiedName" TEXT NOT NULL,
    "companyName" TEXT,
    "parentQboId" TEXT,
    "email" TEXT,
    "balanceCents" INTEGER NOT NULL,
    CONSTRAINT "QboCustomer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QboCustomer_qboId_key" ON "QboCustomer"("qboId");
CREATE INDEX "QboCustomer_parentQboId_idx" ON "QboCustomer"("parentQboId");
CREATE INDEX "QboCustomer_importId_idx" ON "QboCustomer"("importId");
ALTER TABLE "QboCustomer" ADD CONSTRAINT "QboCustomer_importId_fkey" FOREIGN KEY ("importId") REFERENCES "QboImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "QboItem" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "qboId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "description" TEXT,
    CONSTRAINT "QboItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QboItem_qboId_key" ON "QboItem"("qboId");
CREATE INDEX "QboItem_importId_idx" ON "QboItem"("importId");
ALTER TABLE "QboItem" ADD CONSTRAINT "QboItem_importId_fkey" FOREIGN KEY ("importId") REFERENCES "QboImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
