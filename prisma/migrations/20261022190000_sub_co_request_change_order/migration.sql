-- Sub CO requests: link to the change order made on approval. Additive only.

-- AlterTable
ALTER TABLE "SubCoRequest" ADD COLUMN     "changeOrderId" TEXT;

-- AddForeignKey
ALTER TABLE "SubCoRequest" ADD CONSTRAINT "SubCoRequest_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ProjectChangeOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

