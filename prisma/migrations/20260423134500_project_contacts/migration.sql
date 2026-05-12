-- CreateTable
CREATE TABLE "ProjectContact" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" TEXT,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProjectContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectContact_projectId_createdAt_idx" ON "ProjectContact"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectContact_email_idx" ON "ProjectContact"("email");

-- CreateIndex
CREATE INDEX "ProjectContact_phone_idx" ON "ProjectContact"("phone");

-- AddForeignKey
ALTER TABLE "ProjectContact" ADD CONSTRAINT "ProjectContact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;