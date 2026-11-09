-- Sub portal Phase 5: check-in and check-out with location
CREATE TABLE "SubCheckIn" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "contractorId" TEXT NOT NULL,
    "jobKey" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "changeOrderId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "role" TEXT NOT NULL,
    "checkInAt" TIMESTAMP(3),
    "inLatitude" DOUBLE PRECISION,
    "inLongitude" DOUBLE PRECISION,
    "inAccuracy" DOUBLE PRECISION,
    "inMeters" DOUBLE PRECISION,
    "inOffSite" BOOLEAN NOT NULL DEFAULT false,
    "lateMinutes" INTEGER,
    "crewCount" INTEGER,
    "checkOutAt" TIMESTAMP(3),
    "outLatitude" DOUBLE PRECISION,
    "outLongitude" DOUBLE PRECISION,
    "outAccuracy" DOUBLE PRECISION,
    "outMeters" DOUBLE PRECISION,
    "outOffSite" BOOLEAN NOT NULL DEFAULT false,
    "missedAlertAt" TIMESTAMP(3),

    CONSTRAINT "SubCheckIn_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubCheckIn_contractorId_jobKey_date_key" ON "SubCheckIn"("contractorId", "jobKey", "date");
CREATE INDEX "SubCheckIn_projectId_date_idx" ON "SubCheckIn"("projectId", "date");
CREATE INDEX "SubCheckIn_changeOrderId_date_idx" ON "SubCheckIn"("changeOrderId", "date");
CREATE INDEX "SubCheckIn_date_idx" ON "SubCheckIn"("date");

ALTER TABLE "SubCheckIn" ADD CONSTRAINT "SubCheckIn_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubCheckIn" ADD CONSTRAINT "SubCheckIn_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubCheckIn" ADD CONSTRAINT "SubCheckIn_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ProjectChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GeocodeCache" (
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeocodeCache_pkey" PRIMARY KEY ("address")
);
