-- CreateTable
CREATE TABLE "ProjectSOV" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectSOV_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSOVItem" (
    "id" TEXT NOT NULL,
    "sovId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "itemNo" TEXT,
    "costCode" TEXT,
    "description" TEXT NOT NULL,
    "scheduledValueCents" INTEGER NOT NULL DEFAULT 0,
    "previousCompletedCents" INTEGER NOT NULL DEFAULT 0,
    "thisPeriodCents" INTEGER NOT NULL DEFAULT 0,
    "materialsStoredCents" INTEGER NOT NULL DEFAULT 0,
    "retainageCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectSOVItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSOV_projectId_key" ON "ProjectSOV"("projectId");

-- CreateIndex
CREATE INDEX "ProjectSOVItem_sovId_idx" ON "ProjectSOVItem"("sovId");

-- AddForeignKey
ALTER TABLE "ProjectSOV" ADD CONSTRAINT "ProjectSOV_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSOVItem" ADD CONSTRAINT "ProjectSOVItem_sovId_fkey" FOREIGN KEY ("sovId") REFERENCES "ProjectSOV"("id") ON DELETE CASCADE ON UPDATE CASCADE;
