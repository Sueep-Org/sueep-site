-- Drop old contract columns from ProjectChangeOrder
ALTER TABLE "ProjectChangeOrder" DROP COLUMN IF EXISTS "contractPdfData";
ALTER TABLE "ProjectChangeOrder" DROP COLUMN IF EXISTS "contractPdfFilename";
ALTER TABLE "ProjectChangeOrder" DROP COLUMN IF EXISTS "docusealTemplateId";
ALTER TABLE "ProjectChangeOrder" DROP COLUMN IF EXISTS "signingStatus";
ALTER TABLE "ProjectChangeOrder" DROP COLUMN IF EXISTS "customerEmail";
ALTER TABLE "ProjectChangeOrder" DROP COLUMN IF EXISTS "docusealSubmissionId";
ALTER TABLE "ProjectChangeOrder" DROP COLUMN IF EXISTS "signedAt";
ALTER TABLE "ProjectChangeOrder" DROP COLUMN IF EXISTS "signedDocumentUrl";

-- Create ChangeOrderContract table
CREATE TABLE "ChangeOrderContract" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changeOrderId" TEXT NOT NULL,
    "contractPdfFilename" TEXT,
    "docusealTemplateId" INTEGER,
    "signingStatus" TEXT,
    "customerEmail" TEXT,
    "docusealSubmissionId" INTEGER,
    "signedAt" TIMESTAMP(3),
    "signedDocumentUrl" TEXT,
    CONSTRAINT "ChangeOrderContract_pkey" PRIMARY KEY ("id")
);

-- Foreign key
ALTER TABLE "ChangeOrderContract" ADD CONSTRAINT "ChangeOrderContract_changeOrderId_fkey"
    FOREIGN KEY ("changeOrderId") REFERENCES "ProjectChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "ChangeOrderContract_changeOrderId_idx" ON "ChangeOrderContract"("changeOrderId");
CREATE INDEX "ChangeOrderContract_docusealSubmissionId_idx" ON "ChangeOrderContract"("docusealSubmissionId");
