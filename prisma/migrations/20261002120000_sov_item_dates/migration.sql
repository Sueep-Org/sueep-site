-- When each SOV line was finished and paid, so the finance dashboard can count it in its own month.
ALTER TABLE "ProjectSOVItem" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "ProjectSOVItem" ADD COLUMN "paidAt" TIMESTAMP(3);
