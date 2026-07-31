-- CreateTable
CREATE TABLE "BuildingNote" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "buildingId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorUserId" TEXT,

    CONSTRAINT "BuildingNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BuildingNote_buildingId_idx" ON "BuildingNote"("buildingId");

-- AddForeignKey
ALTER TABLE "BuildingNote" ADD CONSTRAINT "BuildingNote_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildingNote" ADD CONSTRAINT "BuildingNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "ErpUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
