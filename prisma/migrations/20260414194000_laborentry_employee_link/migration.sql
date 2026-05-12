-- Link labor entries to employee records when known.
ALTER TABLE "LaborEntry"
ADD COLUMN "employeeId" TEXT;

CREATE INDEX "LaborEntry_employeeId_idx" ON "LaborEntry"("employeeId");

ALTER TABLE "LaborEntry"
ADD CONSTRAINT "LaborEntry_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
ON DELETE SET NULL ON UPDATE CASCADE;