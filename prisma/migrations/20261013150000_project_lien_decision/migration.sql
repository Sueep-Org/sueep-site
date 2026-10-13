-- What was decided about a lien on a job, and which lien stage its alert email already went out for.
ALTER TABLE "Project" ADD COLUMN "lienDecision" TEXT;
ALTER TABLE "Project" ADD COLUMN "lienDecisionNote" TEXT;
ALTER TABLE "Project" ADD COLUMN "lienDecisionAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "lienDecisionBy" TEXT;
ALTER TABLE "Project" ADD COLUMN "lienAlertedStage" TEXT;
