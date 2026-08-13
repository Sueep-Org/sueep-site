-- Drop old turnoverRequest foreign key and column
ALTER TABLE "ContractorAssignment" DROP CONSTRAINT "ContractorAssignment_turnoverRequestId_fkey";
DROP INDEX IF EXISTS "ContractorAssignment_turnoverRequestId_idx";
ALTER TABLE "ContractorAssignment" DROP COLUMN "turnoverRequestId";

-- Add building and project links (both optional)
ALTER TABLE "ContractorAssignment" ADD COLUMN "buildingId" TEXT;
ALTER TABLE "ContractorAssignment" ADD COLUMN "projectId"  TEXT;

-- Foreign keys
ALTER TABLE "ContractorAssignment" ADD CONSTRAINT "ContractorAssignment_buildingId_fkey"
    FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContractorAssignment" ADD CONSTRAINT "ContractorAssignment_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "ContractorAssignment_buildingId_idx" ON "ContractorAssignment"("buildingId");
CREATE INDEX "ContractorAssignment_projectId_idx"  ON "ContractorAssignment"("projectId");
