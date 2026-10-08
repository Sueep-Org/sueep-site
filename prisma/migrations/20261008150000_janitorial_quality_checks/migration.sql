-- Quality check visits on janitorial contracts.
CREATE TABLE "JanitorialQualityCheck" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "recurringContractId" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "assignedUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "overdueEmailSentAt" TIMESTAMP(3),

    CONSTRAINT "JanitorialQualityCheck_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JanitorialQualityCheck_recurringContractId_scheduledDate_idx" ON "JanitorialQualityCheck"("recurringContractId", "scheduledDate");
CREATE INDEX "JanitorialQualityCheck_scheduledDate_idx" ON "JanitorialQualityCheck"("scheduledDate");
CREATE INDEX "JanitorialQualityCheck_assignedUserId_idx" ON "JanitorialQualityCheck"("assignedUserId");

ALTER TABLE "JanitorialQualityCheck" ADD CONSTRAINT "JanitorialQualityCheck_recurringContractId_fkey" FOREIGN KEY ("recurringContractId") REFERENCES "RecurringContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JanitorialQualityCheck" ADD CONSTRAINT "JanitorialQualityCheck_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "ErpUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Calendar category. No category-wide reminders: the person doing the check
-- gets their own email the day before (see janitorialQualityReminders.ts).
INSERT INTO "ManagementCategory" ("id", "updatedAt", "builtinKey", "name", "color", "remindDays", "sortOrder")
VALUES ('mgmtcat_quality_checks', CURRENT_TIMESTAMP, 'QUALITY_CHECKS', 'Quality checks', 'violet', ARRAY[]::INTEGER[], 9)
ON CONFLICT DO NOTHING;
