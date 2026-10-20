-- Confirm or Can't make it answers to schedule invites. Additive only.

-- CreateTable
CREATE TABLE "ScheduleConfirmation" (
    "uid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "personName" TEXT NOT NULL,
    "personEmail" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "link" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "respondedAt" TIMESTAMP(3),
    "inviteSentAt" TIMESTAMP(3),
    "unansweredAlertAt" TIMESTAMP(3),

    CONSTRAINT "ScheduleConfirmation_pkey" PRIMARY KEY ("uid")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleConfirmation_token_key" ON "ScheduleConfirmation"("token");

-- CreateIndex
CREATE INDEX "ScheduleConfirmation_dateKey_status_idx" ON "ScheduleConfirmation"("dateKey", "status");
