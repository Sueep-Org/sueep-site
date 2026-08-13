-- CreateTable
CREATE TABLE "ChangeOrderPricingPackage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "unitLabel" TEXT NOT NULL DEFAULT 'unit',
    "cleanerHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "foremanHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,

    CONSTRAINT "ChangeOrderPricingPackage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChangeOrderPricingPackage_active_idx" ON "ChangeOrderPricingPackage"("active" ASC);

-- AddForeignKey
ALTER TABLE "ChangeOrderPricingPackage" ADD CONSTRAINT "ChangeOrderPricingPackage_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "ErpUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

