-- Turnovers property managers ask for on their link, kept apart from
-- TurnoverRequest until staff confirm them.

-- CreateTable
CREATE TABLE "PropertyManagerRequest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "propertyManagerId" TEXT,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "bedrooms" INTEGER NOT NULL,
    "bathrooms" INTEGER NOT NULL,
    "fullClean" BOOLEAN NOT NULL DEFAULT false,
    "fullPaint" BOOLEAN NOT NULL DEFAULT false,
    "touchUpPaint" BOOLEAN NOT NULL DEFAULT false,
    "carpetCleaning" BOOLEAN NOT NULL DEFAULT false,
    "otherWork" BOOLEAN NOT NULL DEFAULT false,
    "otherDescription" TEXT,
    "requestedStartDate" TIMESTAMP(3) NOT NULL,
    "moveOutDate" TIMESTAMP(3),
    "moveInDate" TIMESTAMP(3),
    "notes" TEXT,
    "estimateCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',

    CONSTRAINT "PropertyManagerRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PropertyManagerRequest_buildingId_status_idx" ON "PropertyManagerRequest"("buildingId", "status");

-- CreateIndex
CREATE INDEX "PropertyManagerRequest_propertyManagerId_idx" ON "PropertyManagerRequest"("propertyManagerId");

-- CreateIndex
CREATE INDEX "PropertyManagerRequest_status_createdAt_idx" ON "PropertyManagerRequest"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "PropertyManagerRequest" ADD CONSTRAINT "PropertyManagerRequest_propertyManagerId_fkey" FOREIGN KEY ("propertyManagerId") REFERENCES "PropertyManager"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyManagerRequest" ADD CONSTRAINT "PropertyManagerRequest_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

