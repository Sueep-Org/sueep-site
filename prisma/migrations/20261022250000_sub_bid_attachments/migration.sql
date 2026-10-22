-- Files on sub bids (Proposals tab). New table only, nothing existing changes.

-- CreateTable
CREATE TABLE "SubBidAttachment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bidId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedBy" TEXT,

    CONSTRAINT "SubBidAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubBidAttachment_bidId_idx" ON "SubBidAttachment"("bidId");

-- AddForeignKey
ALTER TABLE "SubBidAttachment" ADD CONSTRAINT "SubBidAttachment_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "SubBid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

