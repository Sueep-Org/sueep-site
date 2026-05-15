-- CreateTable
CREATE TABLE "CandidateApplication" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "positionInterest" TEXT,
    "additionalNotes" TEXT,
    "responses" JSONB,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "internalNotes" TEXT,

    CONSTRAINT "CandidateApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CandidateApplication_status_idx" ON "CandidateApplication"("status");

-- CreateIndex
CREATE INDEX "CandidateApplication_createdAt_idx" ON "CandidateApplication"("createdAt");

-- CreateIndex
CREATE INDEX "CandidateApplication_email_idx" ON "CandidateApplication"("email");