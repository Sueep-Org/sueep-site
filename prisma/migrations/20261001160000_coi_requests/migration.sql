-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "coiRequestToken" TEXT;

-- AlterTable
ALTER TABLE "ProjectCoi" ADD COLUMN     "requestId" TEXT;

-- CreateTable
CREATE TABLE "CoiRequest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT,
    "projectText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "requesterName" TEXT NOT NULL,
    "requesterCompany" TEXT,
    "requesterEmail" TEXT NOT NULL,
    "requesterPhone" TEXT,
    "neededBy" TIMESTAMP(3),
    "holders" JSONB NOT NULL,
    "reqGlOccurrenceCents" INTEGER,
    "reqGlAggregateCents" INTEGER,
    "reqAutoCents" INTEGER,
    "reqUmbrellaCents" INTEGER,
    "reqWcEmployersLiabilityCents" INTEGER,
    "requiresAdditionalInsured" BOOLEAN NOT NULL DEFAULT false,
    "requiresWaiverOfSubrogation" BOOLEAN NOT NULL DEFAULT false,
    "requiresPrimaryNoncontributory" BOOLEAN NOT NULL DEFAULT false,
    "additionalInsureds" TEXT,
    "specialWording" TEXT,
    "notes" TEXT,
    "sampleFilename" TEXT,
    "sampleMimeType" TEXT,
    "sampleData" BYTEA,

    CONSTRAINT "CoiRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoiRequest_status_createdAt_idx" ON "CoiRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CoiRequest_projectId_idx" ON "CoiRequest"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_coiRequestToken_key" ON "Project"("coiRequestToken");

-- CreateIndex
CREATE INDEX "ProjectCoi_requestId_idx" ON "ProjectCoi"("requestId");

-- AddForeignKey
ALTER TABLE "ProjectCoi" ADD CONSTRAINT "ProjectCoi_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CoiRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoiRequest" ADD CONSTRAINT "CoiRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

