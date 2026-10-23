-- Deals board: each person's card details and saved filter views.
CREATE TABLE "BoardPreference" (
    "id" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userEmail" TEXT NOT NULL,
    "pipeline" TEXT NOT NULL,
    "cardFields" TEXT[],

    CONSTRAINT "BoardPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavedBoardView" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userEmail" TEXT NOT NULL,
    "pipeline" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "closed" TEXT NOT NULL DEFAULT 'recent',
    "shared" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SavedBoardView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BoardPreference_userEmail_pipeline_key" ON "BoardPreference"("userEmail", "pipeline");
CREATE INDEX "SavedBoardView_pipeline_userEmail_idx" ON "SavedBoardView"("pipeline", "userEmail");
CREATE INDEX "SavedBoardView_pipeline_shared_idx" ON "SavedBoardView"("pipeline", "shared");
