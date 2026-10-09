-- HubSpot invoices per unit (any status), mirrored for showing on turns.
CREATE TABLE "HubSpotUnitInvoice" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "buildingId" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "turnoverRequestId" TEXT,
    "hubspotInvoiceId" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "status" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "paidDate" TIMESTAMP(3),
    "amountCents" INTEGER NOT NULL,
    "invoiceTotalCents" INTEGER,
    "balanceDueCents" INTEGER,
    "viewUrl" TEXT,
    "pdfUrl" TEXT,

    CONSTRAINT "HubSpotUnitInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HubSpotUnitInvoice_hubspotInvoiceId_unitNumber_key" ON "HubSpotUnitInvoice"("hubspotInvoiceId", "unitNumber");
CREATE INDEX "HubSpotUnitInvoice_buildingId_unitNumber_idx" ON "HubSpotUnitInvoice"("buildingId", "unitNumber");
CREATE INDEX "HubSpotUnitInvoice_turnoverRequestId_idx" ON "HubSpotUnitInvoice"("turnoverRequestId");

ALTER TABLE "HubSpotUnitInvoice" ADD CONSTRAINT "HubSpotUnitInvoice_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HubSpotUnitInvoice" ADD CONSTRAINT "HubSpotUnitInvoice_turnoverRequestId_fkey" FOREIGN KEY ("turnoverRequestId") REFERENCES "TurnoverRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
