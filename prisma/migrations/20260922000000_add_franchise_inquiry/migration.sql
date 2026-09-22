-- CreateTable
CREATE TABLE "FranchiseInquiry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "cityState" TEXT NOT NULL,
    "market" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "internalNotes" TEXT,
    "responses" JSONB,

    CONSTRAINT "FranchiseInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FranchiseInquiry_status_idx" ON "FranchiseInquiry"("status");

-- CreateIndex
CREATE INDEX "FranchiseInquiry_createdAt_idx" ON "FranchiseInquiry"("createdAt");

-- CreateIndex
CREATE INDEX "FranchiseInquiry_email_idx" ON "FranchiseInquiry"("email");

