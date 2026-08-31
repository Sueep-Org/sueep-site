-- CreateEnum
CREATE TYPE "EstimatorUserRole" AS ENUM ('OWNER', 'MEMBER');

-- AlterTable
ALTER TABLE "EstimatorUser" ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "role" "EstimatorUserRole" NOT NULL DEFAULT 'MEMBER';

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_inviteCode_key" ON "Company"("inviteCode");

-- CreateIndex
CREATE INDEX "EstimatorUser_companyId_idx" ON "EstimatorUser"("companyId");

-- AddForeignKey
ALTER TABLE "EstimatorUser" ADD CONSTRAINT "EstimatorUser_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

