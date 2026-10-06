-- Emailed sign-in codes for property manager links, and the devices
-- they've signed in on so they aren't asked again.

-- AlterTable
ALTER TABLE "PropertyManager" ADD COLUMN     "signInCodeAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "signInCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "signInCodeHash" TEXT,
ADD COLUMN     "signInCodeSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PropertyManagerDevice" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "propertyManagerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,

    CONSTRAINT "PropertyManagerDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertyManagerDevice_tokenHash_key" ON "PropertyManagerDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "PropertyManagerDevice_propertyManagerId_idx" ON "PropertyManagerDevice"("propertyManagerId");

-- AddForeignKey
ALTER TABLE "PropertyManagerDevice" ADD CONSTRAINT "PropertyManagerDevice_propertyManagerId_fkey" FOREIGN KEY ("propertyManagerId") REFERENCES "PropertyManager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

