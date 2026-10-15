-- Client companies (property managers, GCs, owners), their billing profile,
-- contacts and building management history. Optional links from Building,
-- Project, PropertyManager, CoiHolder and CompanyLogin. Additive only.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "billingOverrideCc" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "billingOverrideMethod" TEXT,
ADD COLUMN     "billingOverrideNote" TEXT,
ADD COLUMN     "billingOverridePortalUrl" TEXT,
ADD COLUMN     "billingOverrideSendTo" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "clientCompanyId" TEXT;

-- AlterTable
ALTER TABLE "Building" ADD COLUMN     "billingOverrideCc" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "billingOverrideMethod" TEXT,
ADD COLUMN     "billingOverrideNote" TEXT,
ADD COLUMN     "billingOverridePortalUrl" TEXT,
ADD COLUMN     "billingOverrideSendTo" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "managedByCompanyId" TEXT,
ADD COLUMN     "ownedByCompanyId" TEXT;

-- AlterTable
ALTER TABLE "CoiHolder" ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "PropertyManager" ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "CompanyLogin" ADD COLUMN     "clientCompanyId" TEXT;

-- CreateTable
CREATE TABLE "ClientCompany" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "hubspotCompanyId" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "billingMethod" TEXT,
    "billingPortalUrl" TEXT,
    "billingSendTo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "billingCc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "billingCutoffDay" INTEGER,
    "billingCutoffNote" TEXT,
    "billingFrequency" TEXT,
    "paymentTermsDays" INTEGER,
    "billingInstructions" TEXT,
    "updatedByEmail" TEXT,

    CONSTRAINT "ClientCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientCompanyContact" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,

    CONSTRAINT "ClientCompanyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildingManagementPeriod" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "buildingId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fromDate" DATE,
    "toDate" DATE,
    "changedByEmail" TEXT,

    CONSTRAINT "BuildingManagementPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientCompany_hubspotCompanyId_key" ON "ClientCompany"("hubspotCompanyId");

-- CreateIndex
CREATE INDEX "ClientCompany_archived_name_idx" ON "ClientCompany"("archived", "name");

-- CreateIndex
CREATE INDEX "ClientCompanyContact_companyId_idx" ON "ClientCompanyContact"("companyId");

-- CreateIndex
CREATE INDEX "BuildingManagementPeriod_buildingId_idx" ON "BuildingManagementPeriod"("buildingId");

-- CreateIndex
CREATE INDEX "BuildingManagementPeriod_companyId_idx" ON "BuildingManagementPeriod"("companyId");

-- CreateIndex
CREATE INDEX "Project_clientCompanyId_idx" ON "Project"("clientCompanyId");

-- CreateIndex
CREATE INDEX "Building_managedByCompanyId_idx" ON "Building"("managedByCompanyId");

-- CreateIndex
CREATE INDEX "Building_ownedByCompanyId_idx" ON "Building"("ownedByCompanyId");

-- CreateIndex
CREATE INDEX "CompanyLogin_clientCompanyId_idx" ON "CompanyLogin"("clientCompanyId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientCompanyId_fkey" FOREIGN KEY ("clientCompanyId") REFERENCES "ClientCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_managedByCompanyId_fkey" FOREIGN KEY ("managedByCompanyId") REFERENCES "ClientCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_ownedByCompanyId_fkey" FOREIGN KEY ("ownedByCompanyId") REFERENCES "ClientCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoiHolder" ADD CONSTRAINT "CoiHolder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "ClientCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyManager" ADD CONSTRAINT "PropertyManager_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "ClientCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyLogin" ADD CONSTRAINT "CompanyLogin_clientCompanyId_fkey" FOREIGN KEY ("clientCompanyId") REFERENCES "ClientCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCompanyContact" ADD CONSTRAINT "ClientCompanyContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "ClientCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildingManagementPeriod" ADD CONSTRAINT "BuildingManagementPeriod_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildingManagementPeriod" ADD CONSTRAINT "BuildingManagementPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "ClientCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

