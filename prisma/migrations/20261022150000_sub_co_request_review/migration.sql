-- Sub CO requests: office review (surcharge, cancel reason, history). Additive only.

-- AlterTable
ALTER TABLE "SubCoRequest" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "surchargeId" TEXT,
ADD COLUMN     "surchargeLabel" TEXT,
ADD COLUMN     "surchargePercent" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "SubCoRequestEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "SubCoRequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubCoRequestEvent_requestId_createdAt_idx" ON "SubCoRequestEvent"("requestId", "createdAt");

-- AddForeignKey
ALTER TABLE "SubCoRequestEvent" ADD CONSTRAINT "SubCoRequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SubCoRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

