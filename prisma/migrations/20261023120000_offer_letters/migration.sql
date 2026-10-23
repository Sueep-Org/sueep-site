-- Offer letter templates and the letters made from them (office hiring).
CREATE TABLE "OfferLetterTemplate" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sections" JSONB NOT NULL,
    "commissionDefaults" JSONB,
    "signerName" TEXT,
    "signerTitle" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "OfferLetterTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfferLetter" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "candidateId" TEXT NOT NULL,
    "templateId" TEXT,
    "values" JSONB NOT NULL,
    "sections" JSONB NOT NULL,
    "commission" JSONB,
    "renderedPdf" BYTEA,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "signByDate" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "sentBy" TEXT,
    "createdBy" TEXT,
    "candidateContractId" TEXT,

    CONSTRAINT "OfferLetter_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OfferLetterTemplate_archived_idx" ON "OfferLetterTemplate"("archived");
CREATE UNIQUE INDEX "OfferLetter_candidateContractId_key" ON "OfferLetter"("candidateContractId");
CREATE INDEX "OfferLetter_candidateId_idx" ON "OfferLetter"("candidateId");
CREATE INDEX "OfferLetter_status_idx" ON "OfferLetter"("status");

ALTER TABLE "OfferLetter" ADD CONSTRAINT "OfferLetter_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfferLetter" ADD CONSTRAINT "OfferLetter_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OfferLetterTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
