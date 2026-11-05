-- Portal status on uploaded invoices (INVOICE_TRACKING_PLAN.md Phase 2)
ALTER TABLE "InvoiceDelivery" ADD COLUMN "portalStatus" TEXT;
ALTER TABLE "InvoiceDelivery" ADD COLUMN "portalStatusAt" TIMESTAMP(3);
ALTER TABLE "InvoiceDelivery" ADD COLUMN "sentBackReason" TEXT;

CREATE TABLE "InvoiceDeliveryStatusChange" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "note" TEXT,
    "portalReference" TEXT,
    "byEmail" TEXT NOT NULL,

    CONSTRAINT "InvoiceDeliveryStatusChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InvoiceDeliveryStatusChange_deliveryId_idx" ON "InvoiceDeliveryStatusChange"("deliveryId");

ALTER TABLE "InvoiceDeliveryStatusChange" ADD CONSTRAINT "InvoiceDeliveryStatusChange_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "InvoiceDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
