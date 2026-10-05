-- CreateTable
CREATE TABLE "NotificationSetting" (
    "type" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "to" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedBy" TEXT,

    CONSTRAINT "NotificationSetting_pkey" PRIMARY KEY ("type")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "to" TEXT[],
    "cc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bcc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "replyTo" TEXT,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "providerId" TEXT,
    "html" TEXT,
    "hasAttachments" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "resentFromId" TEXT,
    "sentBy" TEXT,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_type_createdAt_idx" ON "EmailLog"("type", "createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_status_createdAt_idx" ON "EmailLog"("status", "createdAt");

-- The COI request notify address moves from AppSetting into the new
-- settings table, so it's edited in one place.
INSERT INTO "NotificationSetting" ("type", "updatedAt", "enabled", "to", "cc")
SELECT 'COI_REQUEST_RECEIVED', CURRENT_TIMESTAMP, true,
       array_remove(string_to_array(lower(regexp_replace("value", '\s', '', 'g')), ','), ''),
       ARRAY[]::TEXT[]
FROM "AppSetting" WHERE "key" = 'coiRequestNotifyEmail' AND trim("value") <> '';
