-- AlterTable
ALTER TABLE "InsurancePolicy" ADD COLUMN     "onCertificates" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ProjectCoi" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "holderId" TEXT,
    "holderName" TEXT NOT NULL,
    "issuedOn" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentOn" TIMESTAMP(3),
    "sentTo" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "ProjectCoi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCoiPolicy" (
    "id" TEXT NOT NULL,
    "coiId" TEXT NOT NULL,
    "policyId" TEXT,
    "policyType" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "policyNumber" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectCoiPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectCoi_projectId_idx" ON "ProjectCoi"("projectId");

-- CreateIndex
CREATE INDEX "ProjectCoi_holderId_idx" ON "ProjectCoi"("holderId");

-- CreateIndex
CREATE INDEX "ProjectCoi_expiresAt_idx" ON "ProjectCoi"("expiresAt");

-- CreateIndex
CREATE INDEX "ProjectCoiPolicy_coiId_idx" ON "ProjectCoiPolicy"("coiId");

-- CreateIndex
CREATE INDEX "ProjectCoiPolicy_policyId_idx" ON "ProjectCoiPolicy"("policyId");

-- AddForeignKey
ALTER TABLE "ProjectCoi" ADD CONSTRAINT "ProjectCoi_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCoi" ADD CONSTRAINT "ProjectCoi_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "CoiHolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCoiPolicy" ADD CONSTRAINT "ProjectCoiPolicy_coiId_fkey" FOREIGN KEY ("coiId") REFERENCES "ProjectCoi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCoiPolicy" ADD CONSTRAINT "ProjectCoiPolicy_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "InsurancePolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

