-- CreateTable
CREATE TABLE "MaterialEntry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "usedOn" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "costCents" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "MaterialEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistanceEntry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "travelDate" TIMESTAMP(3) NOT NULL,
    "miles" DOUBLE PRECISION NOT NULL,
    "personName" TEXT,
    "notes" TEXT,

    CONSTRAINT "DistanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialEntry_projectId_idx" ON "MaterialEntry"("projectId");

-- CreateIndex
CREATE INDEX "MaterialEntry_usedOn_idx" ON "MaterialEntry"("usedOn");

-- CreateIndex
CREATE INDEX "MaterialEntry_category_idx" ON "MaterialEntry"("category");

-- CreateIndex
CREATE INDEX "DistanceEntry_projectId_idx" ON "DistanceEntry"("projectId");

-- CreateIndex
CREATE INDEX "DistanceEntry_travelDate_idx" ON "DistanceEntry"("travelDate");

-- AddForeignKey
ALTER TABLE "MaterialEntry" ADD CONSTRAINT "MaterialEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistanceEntry" ADD CONSTRAINT "DistanceEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;