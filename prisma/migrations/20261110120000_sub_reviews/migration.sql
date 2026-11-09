-- Sub portal Phase 7: quality review of sub work
-- AlterTable
ALTER TABLE "SubJobPhoto" ADD COLUMN     "reviewRound" INTEGER,
ADD COLUMN     "uploadedBy" TEXT;

-- CreateTable
CREATE TABLE "SubReview" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "checkInId" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "changeOrderId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "pmUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "round" INTEGER NOT NULL DEFAULT 1,
    "fixItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fixNote" TEXT,
    "passedAt" TIMESTAMP(3),
    "passedBy" TEXT,
    "qualityCheckId" TEXT,

    CONSTRAINT "SubReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubReviewEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "by" TEXT NOT NULL,
    "note" TEXT,
    "items" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "onSite" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SubReviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubReview_checkInId_key" ON "SubReview"("checkInId");

-- CreateIndex
CREATE INDEX "SubReview_status_createdAt_idx" ON "SubReview"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SubReview_projectId_idx" ON "SubReview"("projectId");

-- CreateIndex
CREATE INDEX "SubReview_contractorId_status_idx" ON "SubReview"("contractorId", "status");

-- CreateIndex
CREATE INDEX "SubReview_pmUserId_status_idx" ON "SubReview"("pmUserId", "status");

-- CreateIndex
CREATE INDEX "SubReviewEvent_reviewId_createdAt_idx" ON "SubReviewEvent"("reviewId", "createdAt");

-- AddForeignKey
ALTER TABLE "SubReview" ADD CONSTRAINT "SubReview_checkInId_fkey" FOREIGN KEY ("checkInId") REFERENCES "SubCheckIn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubReview" ADD CONSTRAINT "SubReview_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubReview" ADD CONSTRAINT "SubReview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubReview" ADD CONSTRAINT "SubReview_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ProjectChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubReviewEvent" ADD CONSTRAINT "SubReviewEvent_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "SubReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

