-- Links client companies to Company Info logins (many to many). Additive only.

-- CreateTable
CREATE TABLE "ClientCompanyLogin" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT NOT NULL,
    "loginId" TEXT NOT NULL,
    "linkedByEmail" TEXT,

    CONSTRAINT "ClientCompanyLogin_pkey" PRIMARY KEY ("companyId","loginId")
);

-- CreateIndex
CREATE INDEX "ClientCompanyLogin_loginId_idx" ON "ClientCompanyLogin"("loginId");

-- AddForeignKey
ALTER TABLE "ClientCompanyLogin" ADD CONSTRAINT "ClientCompanyLogin_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "ClientCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCompanyLogin" ADD CONSTRAINT "ClientCompanyLogin_loginId_fkey" FOREIGN KEY ("loginId") REFERENCES "CompanyLogin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

