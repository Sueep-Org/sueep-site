-- CreateTable
CREATE TABLE "ProjectLaborAssignment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "role" TEXT,
    "assignedDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "ProjectLaborAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectLaborAssignment_projectId_idx" ON "ProjectLaborAssignment"("projectId");

-- CreateIndex
CREATE INDEX "ProjectLaborAssignment_employeeId_idx" ON "ProjectLaborAssignment"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectLaborAssignment_projectId_employeeId_key" ON "ProjectLaborAssignment"("projectId", "employeeId");

-- AddForeignKey
ALTER TABLE "ProjectLaborAssignment" ADD CONSTRAINT "ProjectLaborAssignment_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectLaborAssignment" ADD CONSTRAINT "ProjectLaborAssignment_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
