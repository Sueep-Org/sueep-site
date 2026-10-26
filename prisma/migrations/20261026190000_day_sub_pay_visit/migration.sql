-- Which visit pay (typed on the schedule's day card) a day belongs to. See src/lib/erp/subPay.ts.
ALTER TABLE "ProjectDayAssignment" ADD COLUMN "subPayAssignmentId" TEXT;
ALTER TABLE "ProjectDayAssignment" ADD CONSTRAINT "ProjectDayAssignment_subPayAssignmentId_fkey"
  FOREIGN KEY ("subPayAssignmentId") REFERENCES "ContractorAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ProjectDayAssignment_subPayAssignmentId_idx" ON "ProjectDayAssignment"("subPayAssignmentId");

-- Existing calendar pay lines: the sub's day on the line's date joins it.
UPDATE "ProjectDayAssignment" d
SET "subPayAssignmentId" = c."id"
FROM "ContractorAssignment" c
WHERE c."setOnSchedule" = true
  AND d."projectId" = c."projectId"
  AND d."supervisorContractorId" = c."contractorId"
  AND d."date" = c."endDate";
