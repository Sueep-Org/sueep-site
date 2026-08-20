CREATE TABLE "EstimatorUser" (
    "id" TEXT NOT NULL,
    "firebaseUid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "EstimatorUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EstimatorUser_firebaseUid_key" ON "EstimatorUser"("firebaseUid");
CREATE UNIQUE INDEX "EstimatorUser_email_key" ON "EstimatorUser"("email");
CREATE INDEX "EstimatorUser_email_idx" ON "EstimatorUser"("email");