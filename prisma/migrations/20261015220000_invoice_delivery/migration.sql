-- Invoice delivery tracking (emailed, needs upload, needs sending). Additive only.

-- CreateTable
CREATE TABLE "InvoiceDelivery" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hubspotInvoiceId" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "title" TEXT NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "destType" TEXT NOT NULL,
    "destId" TEXT NOT NULL,
    "link" TEXT,
    "clientCompanyId" TEXT,
    "clientName" TEXT,
    "method" TEXT,
    "portalUrl" TEXT,
    "viewUrl" TEXT,
    "pdfUrl" TEXT,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "sentTo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "emailedAt" TIMESTAMP(3),
    "approvedByEmail" TEXT,
    "doneAt" TIMESTAMP(3),
    "doneByEmail" TEXT,

    CONSTRAINT "InvoiceDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceDelivery_hubspotInvoiceId_key" ON "InvoiceDelivery"("hubspotInvoiceId");

-- CreateIndex
CREATE INDEX "InvoiceDelivery_status_idx" ON "InvoiceDelivery"("status");

