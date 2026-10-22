-- Sub bids on the project Proposals tab. New tables only, nothing existing changes.

-- CreateTable
CREATE TABLE "SubBid" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "contractorId" TEXT,
    "bidderName" TEXT,
    "bidderCompany" TEXT,
    "bidderEmail" TEXT,
    "bidderPhone" TEXT,
    "amountCents" INTEGER NOT NULL,
    "receivedOn" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "notes" TEXT,
    "createdBy" TEXT,

    CONSTRAINT "SubBid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_SubBidSOVItems" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "SubBid_projectId_idx" ON "SubBid"("projectId");

-- CreateIndex
CREATE INDEX "SubBid_contractorId_idx" ON "SubBid"("contractorId");

-- CreateIndex
CREATE INDEX "SubBid_bidderEmail_idx" ON "SubBid"("bidderEmail");

-- CreateIndex
CREATE UNIQUE INDEX "_SubBidSOVItems_AB_unique" ON "_SubBidSOVItems"("A", "B");

-- CreateIndex
CREATE INDEX "_SubBidSOVItems_B_index" ON "_SubBidSOVItems"("B");

-- AddForeignKey
ALTER TABLE "SubBid" ADD CONSTRAINT "SubBid_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubBid" ADD CONSTRAINT "SubBid_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SubBidSOVItems" ADD CONSTRAINT "_SubBidSOVItems_A_fkey" FOREIGN KEY ("A") REFERENCES "ProjectSOVItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SubBidSOVItems" ADD CONSTRAINT "_SubBidSOVItems_B_fkey" FOREIGN KEY ("B") REFERENCES "SubBid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

