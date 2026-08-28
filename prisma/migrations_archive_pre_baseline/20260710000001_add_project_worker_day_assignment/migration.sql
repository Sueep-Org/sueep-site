-- CreateTable
CREATE TABLE "ProjectWorkerDayAssignment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectWorkerDayAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectWorkerDayAssignment_date_idx" ON "ProjectWorkerDayAssignment"("date");

-- CreateIndex
CREATE INDEX "ProjectWorkerDayAssignment_employeeId_idx" ON "ProjectWorkerDayAssignment"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectWorkerDayAssignment_projectId_employeeId_date_key" ON "ProjectWorkerDayAssignment"("projectId", "employeeId", "date");

-- AddForeignKey
ALTER TABLE "ProjectWorkerDayAssignment" ADD CONSTRAINT "ProjectWorkerDayAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectWorkerDayAssignment" ADD CONSTRAINT "ProjectWorkerDayAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
