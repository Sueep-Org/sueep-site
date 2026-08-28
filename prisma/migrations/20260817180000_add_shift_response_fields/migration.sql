-- AlterTable
ALTER TABLE "ProjectDayAssignment" ADD COLUMN     "responseStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "respondedAt" TIMESTAMP(3),
ADD COLUMN     "responseToken" TEXT;

-- AlterTable
ALTER TABLE "ProjectWorkerDayAssignment" ADD COLUMN     "responseStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "respondedAt" TIMESTAMP(3),
ADD COLUMN     "responseToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ProjectDayAssignment_responseToken_key" ON "ProjectDayAssignment"("responseToken");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectWorkerDayAssignment_responseToken_key" ON "ProjectWorkerDayAssignment"("responseToken");
