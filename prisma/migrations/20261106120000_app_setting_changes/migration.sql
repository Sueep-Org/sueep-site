-- Who changed which Settings value and when (Settings page History tab)
CREATE TABLE "AppSettingChange" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "key" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "byEmail" TEXT NOT NULL,

    CONSTRAINT "AppSettingChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AppSettingChange_key_createdAt_idx" ON "AppSettingChange"("key", "createdAt");
CREATE INDEX "AppSettingChange_createdAt_idx" ON "AppSettingChange"("createdAt");
