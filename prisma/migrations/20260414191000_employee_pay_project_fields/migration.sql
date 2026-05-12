-- Add structured compensation/project fields for employees
ALTER TABLE "Employee"
ADD COLUMN "hourlyPayCents" INTEGER,
ADD COLUMN "defaultProject" TEXT;

CREATE INDEX "Employee_defaultProject_idx" ON "Employee"("defaultProject");
CREATE INDEX "Employee_hourlyPayCents_idx" ON "Employee"("hourlyPayCents");