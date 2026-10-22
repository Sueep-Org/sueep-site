-- Sub CO requests: property manager approval link and answer. Additive only.

-- AlterTable
ALTER TABLE "SubCoRequest" ADD COLUMN     "pmAnsweredAt" TIMESTAMP(3),
ADD COLUMN     "pmDenyReason" TEXT,
ADD COLUMN     "pmSentAt" TIMESTAMP(3),
ADD COLUMN     "pmSentTo" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "pmToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SubCoRequest_pmToken_key" ON "SubCoRequest"("pmToken");

