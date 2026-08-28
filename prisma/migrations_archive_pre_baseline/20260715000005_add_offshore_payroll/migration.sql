-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "isOffshore" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "offshoreMonthlyRateCents" INTEGER;

-- CreateTable
CREATE TABLE "OffshorePayrollPayment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "employeeId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "OffshorePayrollPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OffshorePayrollPayment_employeeId_periodStart_key" ON "OffshorePayrollPayment"("employeeId", "periodStart");

-- AddForeignKey
ALTER TABLE "OffshorePayrollPayment" ADD CONSTRAINT "OffshorePayrollPayment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
