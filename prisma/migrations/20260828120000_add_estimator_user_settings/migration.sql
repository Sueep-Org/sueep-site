-- CreateTable
CREATE TABLE "EstimatorUserSettings" (
    "id" TEXT NOT NULL,
    "estimatorUserId" TEXT NOT NULL,
    "cleanerRateCents" INTEGER,
    "foremanRateCents" INTEGER,
    "assistantRateCents" INTEGER,
    "painterRateCents" INTEGER,
    "projectManagerRateCents" INTEGER,
    "officeAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstimatorUserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EstimatorUserSettings_estimatorUserId_key" ON "EstimatorUserSettings"("estimatorUserId");

-- AddForeignKey
ALTER TABLE "EstimatorUserSettings" ADD CONSTRAINT "EstimatorUserSettings_estimatorUserId_fkey" FOREIGN KEY ("estimatorUserId") REFERENCES "EstimatorUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

