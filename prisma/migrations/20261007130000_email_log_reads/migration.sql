-- CreateTable
CREATE TABLE "EmailLogRead" (
    "id" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailLogId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,

    CONSTRAINT "EmailLogRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailLogRead_emailLogId_userEmail_key" ON "EmailLogRead"("emailLogId", "userEmail");

-- CreateIndex
CREATE INDEX "EmailLogRead_userEmail_idx" ON "EmailLogRead"("userEmail");

-- AddForeignKey
ALTER TABLE "EmailLogRead" ADD CONSTRAINT "EmailLogRead_emailLogId_fkey" FOREIGN KEY ("emailLogId") REFERENCES "EmailLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
