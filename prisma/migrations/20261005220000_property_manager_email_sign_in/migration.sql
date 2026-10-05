-- Sign-in buttons in property manager emails, and their Sueep contact.

-- AlterTable
ALTER TABLE "PropertyManager" ADD COLUMN     "sueepContactEmail" TEXT,
ADD COLUMN     "sueepContactName" TEXT,
ADD COLUMN     "sueepContactPhone" TEXT;

-- CreateTable
CREATE TABLE "PropertyManagerSignInLink" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "propertyManagerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyManagerSignInLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertyManagerSignInLink_tokenHash_key" ON "PropertyManagerSignInLink"("tokenHash");

-- CreateIndex
CREATE INDEX "PropertyManagerSignInLink_propertyManagerId_idx" ON "PropertyManagerSignInLink"("propertyManagerId");

-- AddForeignKey
ALTER TABLE "PropertyManagerSignInLink" ADD CONSTRAINT "PropertyManagerSignInLink_propertyManagerId_fkey" FOREIGN KEY ("propertyManagerId") REFERENCES "PropertyManager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

