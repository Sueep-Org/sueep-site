-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "turnoverDigestSentAt" TIMESTAMP(3);

-- Backfill: every turnover unit already completed as of this migration had
-- its chance to be caught by the old "completed today" digest window (or
-- predates the digest entirely). Mark them as already-digested so the new
-- backlog-catching query (turnoverDigestSentAt IS NULL) doesn't try to email
-- property managers about historical completions the moment this ships.
UPDATE "Project"
SET "turnoverDigestSentAt" = COALESCE("turnoverCompletedAt", "updatedAt")
WHERE "segment" = 'JANITORIAL_TURNOVER_REQUESTS'
  AND "status" = 'COMPLETE'
  AND "turnoverCompletedAt" IS NOT NULL;
