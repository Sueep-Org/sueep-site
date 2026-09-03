-- RenameColumn
-- freeTrialPagesUsed -> freeTrialUploadsUsed: the free trial gates at the
-- upload request (proxy-visible), not at individual pages (which are
-- counted inside aiestimator-api's background analysis, out of the
-- proxy's view). See estimator-paywall-plan.md §8.
ALTER TABLE "Company" RENAME COLUMN "freeTrialPagesUsed" TO "freeTrialUploadsUsed";
