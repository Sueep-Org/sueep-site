-- AlterTable
ALTER TABLE "ProjectChangeOrder" ADD COLUMN "clientApprovalToken" TEXT,
ADD COLUMN "clientAnsweredAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectChangeOrder_clientApprovalToken_key" ON "ProjectChangeOrder"("clientApprovalToken");
