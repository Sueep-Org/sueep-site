-- Proof of upload on invoice deliveries (INVOICE_TRACKING_PLAN.md Phase 1)
ALTER TABLE "InvoiceDelivery" ADD COLUMN "doneAs" TEXT;
ALTER TABLE "InvoiceDelivery" ADD COLUMN "portalReference" TEXT;
ALTER TABLE "InvoiceDelivery" ADD COLUMN "doneNote" TEXT;

CREATE TABLE "InvoiceDeliveryProof" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedByEmail" TEXT,

    CONSTRAINT "InvoiceDeliveryProof_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InvoiceDeliveryProof_deliveryId_idx" ON "InvoiceDeliveryProof"("deliveryId");

ALTER TABLE "InvoiceDeliveryProof" ADD CONSTRAINT "InvoiceDeliveryProof_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "InvoiceDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
