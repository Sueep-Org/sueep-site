-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "address" TEXT;
ALTER TABLE "Employee" ADD COLUMN "dateOfBirth" TEXT;
ALTER TABLE "Employee" ADD COLUMN "infoToken" TEXT;
ALTER TABLE "Employee" ADD COLUMN "infoTokenExpiry" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_infoToken_key" ON "Employee"("infoToken");
