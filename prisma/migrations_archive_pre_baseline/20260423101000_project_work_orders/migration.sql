-- CreateTable
CREATE TABLE "ProjectWorkOrder" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "requestedBy" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "dueDate" TIMESTAMP(3),
    "scopeDetails" TEXT,
    "specifications" TEXT,
    "supportInfo" TEXT,
    "photoUrls" JSONB,

    CONSTRAINT "ProjectWorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectWorkOrder_projectId_createdAt_idx" ON "ProjectWorkOrder"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectWorkOrder_priority_idx" ON "ProjectWorkOrder"("priority");

-- CreateIndex
CREATE INDEX "ProjectWorkOrder_dueDate_idx" ON "ProjectWorkOrder"("dueDate");

-- AddForeignKey
ALTER TABLE "ProjectWorkOrder" ADD CONSTRAINT "ProjectWorkOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;