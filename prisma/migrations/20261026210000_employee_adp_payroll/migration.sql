-- Who is paid as a W2 employee through ADP. See src/lib/erp/employerTax.ts.
-- Every employee is, except offshore workers (paid through Offshore Payroll).
ALTER TABLE "Employee" ADD COLUMN "onAdpPayroll" BOOLEAN NOT NULL DEFAULT true;
UPDATE "Employee" SET "onAdpPayroll" = false WHERE "isOffshore" = true;
