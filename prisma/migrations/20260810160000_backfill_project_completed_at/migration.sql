-- Data backfill only, no schema change. Historical JANITORIAL_TURNOVER_REQUESTS
-- projects that were already COMPLETE before completedAt existed have no way
-- to get it stamped retroactively via the app (the completion-transition
-- guard only fires once, on existing.status !== "COMPLETE" -> "COMPLETE").
-- Best-effort: use projectEndDate if set, else updatedAt.
UPDATE "Project"
SET "completedAt" = COALESCE("projectEndDate", "updatedAt")
WHERE "segment" = 'JANITORIAL_TURNOVER_REQUESTS'
  AND "status" = 'COMPLETE'
  AND "completedAt" IS NULL;
