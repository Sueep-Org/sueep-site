-- Contractor pay typed on a change order's schedule day card (see src/lib/erp/subPay.ts).
ALTER TABLE "ChangeOrderContractorAssignment" ADD COLUMN "setOnSchedule" BOOLEAN NOT NULL DEFAULT false;

-- Which visit pay a change order day belongs to.
ALTER TABLE "ChangeOrderDayAssignment" ADD COLUMN "subPayAssignmentId" TEXT;
ALTER TABLE "ChangeOrderDayAssignment" ADD CONSTRAINT "ChangeOrderDayAssignment_subPayAssignmentId_fkey"
  FOREIGN KEY ("subPayAssignmentId") REFERENCES "ChangeOrderContractorAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ChangeOrderDayAssignment_subPayAssignmentId_idx" ON "ChangeOrderDayAssignment"("subPayAssignmentId");
