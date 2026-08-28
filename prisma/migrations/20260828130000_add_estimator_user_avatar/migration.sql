-- AlterTable
ALTER TABLE "EstimatorUser" ADD COLUMN     "avatarData" BYTEA,
ADD COLUMN     "avatarMimeType" TEXT,
ADD COLUMN     "avatarUpdatedAt" TIMESTAMP(3);

