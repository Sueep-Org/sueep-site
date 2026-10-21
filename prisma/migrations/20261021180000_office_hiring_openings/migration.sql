-- Office hiring: job openings, job postings, office fields on candidates. Additive, plus email becomes optional (office candidates may only have a phone).

-- AlterTable
ALTER TABLE "CandidateApplication" ADD COLUMN     "expectedSalary" TEXT,
ADD COLUMN     "jobOpeningId" TEXT,
ADD COLUMN     "shortlisted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "stage" TEXT,
ADD COLUMN     "track" TEXT NOT NULL DEFAULT 'FIELD',
ALTER COLUMN "email" DROP NOT NULL;

-- CreateTable
CREATE TABLE "JobOpening" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT,
    "location" TEXT,
    "workMode" TEXT,
    "salaryMinCents" INTEGER,
    "salaryMaxCents" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "hiringManagerEmail" TEXT,
    "description" TEXT,
    "createdBy" TEXT,

    CONSTRAINT "JobOpening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobPosting" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobOpeningId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "costCents" INTEGER,
    "applicantCount" INTEGER,
    "postedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "JobPosting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobOpening_status_idx" ON "JobOpening"("status");

-- CreateIndex
CREATE INDEX "JobPosting_jobOpeningId_idx" ON "JobPosting"("jobOpeningId");

-- CreateIndex
CREATE INDEX "CandidateApplication_track_idx" ON "CandidateApplication"("track");

-- CreateIndex
CREATE INDEX "CandidateApplication_jobOpeningId_idx" ON "CandidateApplication"("jobOpeningId");

-- AddForeignKey
ALTER TABLE "CandidateApplication" ADD CONSTRAINT "CandidateApplication_jobOpeningId_fkey" FOREIGN KEY ("jobOpeningId") REFERENCES "JobOpening"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_jobOpeningId_fkey" FOREIGN KEY ("jobOpeningId") REFERENCES "JobOpening"("id") ON DELETE CASCADE ON UPDATE CASCADE;

