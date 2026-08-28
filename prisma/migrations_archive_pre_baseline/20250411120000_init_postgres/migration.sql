-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "segment" TEXT NOT NULL DEFAULT 'COMMERCIAL',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "projectDate" TIMESTAMP(3),
    "jobTitle" TEXT NOT NULL,
    "supervisor" TEXT,
    "description" TEXT,
    "percentDone" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percentInvoiced" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contractValueCents" INTEGER,
    "estMaterialCents" INTEGER,
    "estTravelCents" INTEGER,
    "estLaborCents" INTEGER,
    "actualLaborCents" INTEGER,
    "actualMaterialCents" INTEGER,
    "estHours" DOUBLE PRECISION,
    "actualHours" DOUBLE PRECISION,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborEntry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "workerName" TEXT NOT NULL,
    "role" TEXT,
    "hours" DOUBLE PRECISION NOT NULL,
    "hourlyRateCents" INTEGER NOT NULL,
    "taskDescription" TEXT,

    CONSTRAINT "LaborEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_segment_idx" ON "Project"("segment");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_projectDate_idx" ON "Project"("projectDate");

-- CreateIndex
CREATE INDEX "LaborEntry_projectId_idx" ON "LaborEntry"("projectId");

-- CreateIndex
CREATE INDEX "LaborEntry_workDate_idx" ON "LaborEntry"("workDate");

-- AddForeignKey
ALTER TABLE "LaborEntry" ADD CONSTRAINT "LaborEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
