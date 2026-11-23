-- AlterTable
ALTER TABLE "ContractorAssignment" ADD COLUMN     "payHeldAt" TIMESTAMP(3),
ADD COLUMN     "payHeldBy" TEXT,
ADD COLUMN     "payHoldNote" TEXT,
ADD COLUMN     "payReleasedAt" TIMESTAMP(3),
ADD COLUMN     "payReleasedBy" TEXT;

-- AlterTable
ALTER TABLE "ChangeOrderContractorAssignment" ADD COLUMN     "payHeldAt" TIMESTAMP(3),
ADD COLUMN     "payHeldBy" TEXT,
ADD COLUMN     "payHoldNote" TEXT,
ADD COLUMN     "payReleasedAt" TIMESTAMP(3),
ADD COLUMN     "payReleasedBy" TEXT;
