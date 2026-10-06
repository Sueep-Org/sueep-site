-- Website turnover requests go into the same staff queue as property
-- manager link requests.

-- AlterTable
ALTER TABLE "PropertyManagerRequest" ADD COLUMN     "isCommonArea" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requestedEndDate" TIMESTAMP(3),
ADD COLUMN     "requesterPhone" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'PORTAL',
ADD COLUMN     "sqft" INTEGER,
ADD COLUMN     "submitterIpHash" TEXT,
ADD COLUMN     "unitQuality" TEXT;

-- CreateIndex
CREATE INDEX "PropertyManagerRequest_submitterIpHash_createdAt_idx" ON "PropertyManagerRequest"("submitterIpHash", "createdAt");

