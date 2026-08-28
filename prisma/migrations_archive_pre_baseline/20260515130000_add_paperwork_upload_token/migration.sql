-- AlterTable: add token fields for candidate paperwork upload portal
ALTER TABLE "CandidateApplication" ADD COLUMN "paperworkUploadToken" TEXT;
ALTER TABLE "CandidateApplication" ADD COLUMN "paperworkUploadTokenExpiry" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "CandidateApplication_paperworkUploadToken_key" ON "CandidateApplication"("paperworkUploadToken");
