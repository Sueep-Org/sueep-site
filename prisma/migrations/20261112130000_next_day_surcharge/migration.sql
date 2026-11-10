-- AlterTable
ALTER TABLE "ProjectDayAssignment" ADD COLUMN "nextDayUpcharge" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProjectChangeOrder" ADD COLUMN "surchargeKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ProjectChangeOrder_surchargeKey_key" ON "ProjectChangeOrder"("surchargeKey");
