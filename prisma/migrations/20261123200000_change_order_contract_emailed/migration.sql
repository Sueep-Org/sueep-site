-- AlterTable
ALTER TABLE "ChangeOrderContract" ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "sentBy" TEXT,
ADD COLUMN     "sentTo" TEXT,
ADD COLUMN     "unsignedPdfUrl" TEXT;

