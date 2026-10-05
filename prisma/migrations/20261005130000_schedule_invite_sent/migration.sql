-- CreateTable
CREATE TABLE "ScheduleInviteSent" (
    "uid" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleInviteSent_pkey" PRIMARY KEY ("uid")
);
