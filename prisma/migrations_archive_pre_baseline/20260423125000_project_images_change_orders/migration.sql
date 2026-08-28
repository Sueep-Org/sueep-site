-- CreateTable
CREATE TABLE "ProjectImage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "caption" TEXT,
    "uploadedBy" TEXT,
    "takenAt" TIMESTAMP(3),

    CONSTRAINT "ProjectImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectChangeOrder" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "requestedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "estimatedCostCents" INTEGER,
    "estimatedDays" INTEGER,
    "reason" TEXT,
    "resolutionNotes" TEXT,

    CONSTRAINT "ProjectChangeOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectImage_projectId_createdAt_idx" ON "ProjectImage"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectChangeOrder_projectId_createdAt_idx" ON "ProjectChangeOrder"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectChangeOrder_status_idx" ON "ProjectChangeOrder"("status");

-- AddForeignKey
ALTER TABLE "ProjectImage" ADD CONSTRAINT "ProjectImage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectChangeOrder" ADD CONSTRAINT "ProjectChangeOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;