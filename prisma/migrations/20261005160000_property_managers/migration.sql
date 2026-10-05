-- Outside property managers with a private link to their buildings'
-- turnovers, and which buildings each one can see.

-- CreateTable
CREATE TABLE "PropertyManager" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "token" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdBy" TEXT,

    CONSTRAINT "PropertyManager_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyManagerBuilding" (
    "propertyManagerId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,

    CONSTRAINT "PropertyManagerBuilding_pkey" PRIMARY KEY ("propertyManagerId","buildingId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertyManager_email_key" ON "PropertyManager"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyManager_token_key" ON "PropertyManager"("token");

-- CreateIndex
CREATE INDEX "PropertyManagerBuilding_buildingId_idx" ON "PropertyManagerBuilding"("buildingId");

-- AddForeignKey
ALTER TABLE "PropertyManagerBuilding" ADD CONSTRAINT "PropertyManagerBuilding_propertyManagerId_fkey" FOREIGN KEY ("propertyManagerId") REFERENCES "PropertyManager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyManagerBuilding" ADD CONSTRAINT "PropertyManagerBuilding_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;
