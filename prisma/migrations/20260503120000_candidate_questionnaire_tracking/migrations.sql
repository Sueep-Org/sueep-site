-- AlterTable
ALTER TABLE "CandidateApplication" ADD COLUMN "questionnaireToken" TEXT,
ADD COLUMN "questionnaireSentAt" TIMESTAMP(3),
ADD COLUMN "questionnaireCompletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "CandidateApplication_questionnaireToken_key" ON "CandidateApplication"("questionnaireToken");