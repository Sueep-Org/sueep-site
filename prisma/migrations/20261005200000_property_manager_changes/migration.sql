-- Property managers asking to cancel or move a confirmed turnover.

-- CreateTable
CREATE TABLE "PropertyManagerChange" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "propertyManagerId" TEXT,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "newStartDate" TIMESTAMP(3),
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "declineReason" TEXT,
    "staffMessage" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "PropertyManagerChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PropertyManagerChange_projectId_status_idx" ON "PropertyManagerChange"("projectId", "status");

-- CreateIndex
CREATE INDEX "PropertyManagerChange_status_createdAt_idx" ON "PropertyManagerChange"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PropertyManagerChange_propertyManagerId_idx" ON "PropertyManagerChange"("propertyManagerId");

-- AddForeignKey
ALTER TABLE "PropertyManagerChange" ADD CONSTRAINT "PropertyManagerChange_propertyManagerId_fkey" FOREIGN KEY ("propertyManagerId") REFERENCES "PropertyManager"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyManagerChange" ADD CONSTRAINT "PropertyManagerChange_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

