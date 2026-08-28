CREATE TABLE "ProjectContract" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "projectId" TEXT NOT NULL,
  "signingStatus" TEXT NOT NULL DEFAULT 'SIGNED',
  "customerEmail" TEXT,
  "docusealSubmissionId" INTEGER,
  "signedAt" TIMESTAMP(3),
  "signedDocumentUrl" TEXT,
  CONSTRAINT "ProjectContract_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectContract_docusealSubmissionId_key" ON "ProjectContract"("docusealSubmissionId");
CREATE INDEX "ProjectContract_projectId_idx" ON "ProjectContract"("projectId");

ALTER TABLE "ProjectContract" ADD CONSTRAINT "ProjectContract_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
