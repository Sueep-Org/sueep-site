-- One-time data update: switch project and change order billing statuses to
-- the standard words used everywhere else (NOT_BILLED / BILLED / PAID).
--
-- Run this ONLY AFTER the code that understands both spellings
-- (src/lib/erp/billingStatus.ts) is deployed. The live site shares this
-- database, and older code still looks for BILLING / INVOICE_PAID.
--
-- Safe to run more than once. It only rewrites the status words; no rows
-- are deleted. Run with:
--   npx prisma db execute --file prisma/data-migrations/unify-billing-status.sql --schema prisma/schema.prisma

BEGIN;

UPDATE "Project" SET "billingStatus" = 'PAID'       WHERE "billingStatus" = 'INVOICE_PAID';
UPDATE "Project" SET "billingStatus" = 'BILLED'     WHERE "billingStatus" = 'BILLING';
UPDATE "Project" SET "billingStatus" = 'NOT_BILLED' WHERE "billingStatus" IS NULL OR "billingStatus" IN ('INACTIVE', '');

UPDATE "ProjectChangeOrder" SET "billingStatus" = 'PAID'       WHERE "billingStatus" = 'INVOICE_PAID';
UPDATE "ProjectChangeOrder" SET "billingStatus" = 'BILLED'     WHERE "billingStatus" = 'BILLING';
UPDATE "ProjectChangeOrder" SET "billingStatus" = 'NOT_BILLED' WHERE "billingStatus" IS NULL OR "billingStatus" IN ('INACTIVE', '');

COMMIT;
