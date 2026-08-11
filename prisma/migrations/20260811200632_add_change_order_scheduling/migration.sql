-- AlterTable
ALTER TABLE "ProjectChangeOrder" ADD COLUMN     "supervisorUserId" TEXT;

-- CreateTable
CREATE TABLE "ChangeOrderDayAssignment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "changeOrderId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "supervisorUserId" TEXT,
    "projectManagerUserId" TEXT,
    "comment" TEXT,

    CONSTRAINT "ChangeOrderDayAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeOrderWorkerDayAssignment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changeOrderId" TEXT NOT NULL,
    "employeeId" TEXT,
    "contractorId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeOrderWorkerDayAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChangeOrderDayAssignment_date_idx" ON "ChangeOrderDayAssignment"("date");

-- CreateIndex
CREATE INDEX "ChangeOrderDayAssignment_supervisorUserId_idx" ON "ChangeOrderDayAssignment"("supervisorUserId");

-- CreateIndex
CREATE INDEX "ChangeOrderDayAssignment_projectManagerUserId_idx" ON "ChangeOrderDayAssignment"("projectManagerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeOrderDayAssignment_changeOrderId_date_key" ON "ChangeOrderDayAssignment"("changeOrderId", "date");

-- CreateIndex
CREATE INDEX "ChangeOrderWorkerDayAssignment_date_idx" ON "ChangeOrderWorkerDayAssignment"("date");

-- CreateIndex
CREATE INDEX "ChangeOrderWorkerDayAssignment_employeeId_idx" ON "ChangeOrderWorkerDayAssignment"("employeeId");

-- CreateIndex
CREATE INDEX "ChangeOrderWorkerDayAssignment_contractorId_idx" ON "ChangeOrderWorkerDayAssignment"("contractorId");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeOrderWorkerDayAssignment_changeOrderId_employeeId_dat_key" ON "ChangeOrderWorkerDayAssignment"("changeOrderId", "employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeOrderWorkerDayAssignment_changeOrderId_contractorId_d_key" ON "ChangeOrderWorkerDayAssignment"("changeOrderId", "contractorId", "date");

-- AddForeignKey
ALTER TABLE "ProjectChangeOrder" ADD CONSTRAINT "ProjectChangeOrder_supervisorUserId_fkey" FOREIGN KEY ("supervisorUserId") REFERENCES "ErpUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderDayAssignment" ADD CONSTRAINT "ChangeOrderDayAssignment_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ProjectChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderDayAssignment" ADD CONSTRAINT "ChangeOrderDayAssignment_supervisorUserId_fkey" FOREIGN KEY ("supervisorUserId") REFERENCES "ErpUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderDayAssignment" ADD CONSTRAINT "ChangeOrderDayAssignment_projectManagerUserId_fkey" FOREIGN KEY ("projectManagerUserId") REFERENCES "ErpUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderWorkerDayAssignment" ADD CONSTRAINT "ChangeOrderWorkerDayAssignment_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ProjectChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderWorkerDayAssignment" ADD CONSTRAINT "ChangeOrderWorkerDayAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderWorkerDayAssignment" ADD CONSTRAINT "ChangeOrderWorkerDayAssignment_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

