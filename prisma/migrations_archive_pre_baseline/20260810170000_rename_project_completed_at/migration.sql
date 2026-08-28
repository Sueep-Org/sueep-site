-- Rename only, no data change. Project.completedAt is distinct from
-- TurnoverRequest.completedAt and ChangeOrder.completedAt (unrelated fields
-- on other models) — this name made it easy to accidentally read the wrong
-- one, which is what caused the janitorial billing tab to disagree with the
-- completion-digest email. Renaming to make the turnover-specific meaning
-- explicit.
ALTER TABLE "Project" RENAME COLUMN "completedAt" TO "turnoverCompletedAt";
