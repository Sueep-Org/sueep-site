-- Who a lien notice goes to, the proof it was mailed, and which lien steps a person has ticked off.
ALTER TABLE "Project" ADD COLUMN "lienOwnerName" TEXT;
ALTER TABLE "Project" ADD COLUMN "lienOwnerAddress" TEXT;
ALTER TABLE "Project" ADD COLUMN "lienGcName" TEXT;
ALTER TABLE "Project" ADD COLUMN "lienGcAddress" TEXT;
ALTER TABLE "Project" ADD COLUMN "lienNoticeTracking" TEXT;
ALTER TABLE "Project" ADD COLUMN "lienSteps" JSONB;
