-- Liens on janitorial unit turns are tracked per building (a lien is filed against the property). Same fields as Project.
ALTER TABLE "Building" ADD COLUMN "lienState" TEXT;
ALTER TABLE "Building" ADD COLUMN "lienRole" TEXT;
ALTER TABLE "Building" ADD COLUMN "lienResidential" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Building" ADD COLUMN "lienNoticeSentOn" TIMESTAMP(3);
ALTER TABLE "Building" ADD COLUMN "lienNoticeTracking" TEXT;
ALTER TABLE "Building" ADD COLUMN "lienOwnerName" TEXT;
ALTER TABLE "Building" ADD COLUMN "lienOwnerAddress" TEXT;
ALTER TABLE "Building" ADD COLUMN "lienGcName" TEXT;
ALTER TABLE "Building" ADD COLUMN "lienGcAddress" TEXT;
ALTER TABLE "Building" ADD COLUMN "lienSteps" JSONB;
ALTER TABLE "Building" ADD COLUMN "lienDecision" TEXT;
ALTER TABLE "Building" ADD COLUMN "lienDecisionNote" TEXT;
ALTER TABLE "Building" ADD COLUMN "lienDecisionAt" TIMESTAMP(3);
ALTER TABLE "Building" ADD COLUMN "lienDecisionBy" TEXT;
ALTER TABLE "Building" ADD COLUMN "lienAlertedStage" TEXT;
