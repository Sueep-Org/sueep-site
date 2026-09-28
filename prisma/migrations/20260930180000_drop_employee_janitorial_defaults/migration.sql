-- Janitor pay now comes only from the janitorial schedule (see
-- lib/erp/janitorialHours.ts), so the profile's "Hours per week" fallback and
-- "Default building" setting are removed. Neither was ever read by deployed
-- code, so this is safe to run with the deploy.

-- DropForeignKey
ALTER TABLE "Employee" DROP CONSTRAINT "Employee_janitorialDefaultContractId_fkey";

-- AlterTable
ALTER TABLE "Employee" DROP COLUMN "janitorialDefaultContractId",
DROP COLUMN "janitorialWeeklyHours";
