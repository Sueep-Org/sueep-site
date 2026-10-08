-- CreateTable
CREATE TABLE "CompanyLogin" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "username" TEXT,
    "passwordEncrypted" TEXT,
    "passwordChangedAt" TIMESTAMP(3),
    "owner" TEXT,
    "notes" TEXT,
    "updatedByEmail" TEXT,

    CONSTRAINT "CompanyLogin_pkey" PRIMARY KEY ("id")
);
