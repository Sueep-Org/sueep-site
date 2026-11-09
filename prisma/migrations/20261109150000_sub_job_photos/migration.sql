-- Sub portal Phase 6: before and after photos
-- AlterTable
ALTER TABLE "SubCheckIn" ADD COLUMN     "photosWaivedAt" TIMESTAMP(3),
ADD COLUMN     "photosWaivedBy" TEXT,
ADD COLUMN     "photosWaivedReason" TEXT;

-- CreateTable
CREATE TABLE "SubJobPhoto" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkInId" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "area" TEXT,
    "takenAt" TIMESTAMP(3) NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "meters" DOUBLE PRECISION,
    "offSite" BOOLEAN NOT NULL DEFAULT false,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "size" INTEGER NOT NULL,
    "thumbSize" INTEGER NOT NULL,

    CONSTRAINT "SubJobPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubJobPhotoData" (
    "photoId" TEXT NOT NULL,
    "full" BYTEA NOT NULL,
    "thumb" BYTEA NOT NULL,

    CONSTRAINT "SubJobPhotoData_pkey" PRIMARY KEY ("photoId")
);

-- CreateIndex
CREATE INDEX "SubJobPhoto_checkInId_idx" ON "SubJobPhoto"("checkInId");

-- CreateIndex
CREATE INDEX "SubJobPhoto_projectId_date_idx" ON "SubJobPhoto"("projectId", "date");

-- CreateIndex
CREATE INDEX "SubJobPhoto_contractorId_createdAt_idx" ON "SubJobPhoto"("contractorId", "createdAt");

-- AddForeignKey
ALTER TABLE "SubJobPhoto" ADD CONSTRAINT "SubJobPhoto_checkInId_fkey" FOREIGN KEY ("checkInId") REFERENCES "SubCheckIn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubJobPhotoData" ADD CONSTRAINT "SubJobPhotoData_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "SubJobPhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

