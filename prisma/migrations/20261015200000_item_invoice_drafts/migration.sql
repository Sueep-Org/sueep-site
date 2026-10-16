-- HubSpot drafts made from picked finished items (Ready to bill). Additive only.

-- CreateTable
CREATE TABLE "ItemInvoiceDraft" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hubspotInvoiceId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "groupType" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdByEmail" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedByEmail" TEXT,
    "discardedAt" TIMESTAMP(3),
    "discardedByEmail" TEXT,
    "invoiceNumber" TEXT,
    "note" TEXT,

    CONSTRAINT "ItemInvoiceDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemInvoiceDraft_hubspotInvoiceId_key" ON "ItemInvoiceDraft"("hubspotInvoiceId");

-- CreateIndex
CREATE INDEX "ItemInvoiceDraft_status_idx" ON "ItemInvoiceDraft"("status");

