-- Each person's own dashboard layout and last visit.
CREATE TABLE "DashboardPreference" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userEmail" TEXT NOT NULL,
    "hiddenCards" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cardOrder" JSONB,
    "startTab" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "previousSeenAt" TIMESTAMP(3),

    CONSTRAINT "DashboardPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DashboardPreference_userEmail_key" ON "DashboardPreference"("userEmail");
