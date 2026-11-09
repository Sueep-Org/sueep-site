-- Users page: turning sub portals and property manager pages off and on
ALTER TABLE "Contractor" ADD COLUMN "portalTurnedOffAt" TIMESTAMP(3);

CREATE TABLE "PortalAccessEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contractorId" TEXT,
    "propertyManagerId" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "by" TEXT NOT NULL,
    CONSTRAINT "PortalAccessEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PortalAccessEvent_contractorId_createdAt_idx" ON "PortalAccessEvent"("contractorId", "createdAt");
CREATE INDEX "PortalAccessEvent_propertyManagerId_createdAt_idx" ON "PortalAccessEvent"("propertyManagerId", "createdAt");
ALTER TABLE "PortalAccessEvent" ADD CONSTRAINT "PortalAccessEvent_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortalAccessEvent" ADD CONSTRAINT "PortalAccessEvent_propertyManagerId_fkey" FOREIGN KEY ("propertyManagerId") REFERENCES "PropertyManager"("id") ON DELETE CASCADE ON UPDATE CASCADE;
