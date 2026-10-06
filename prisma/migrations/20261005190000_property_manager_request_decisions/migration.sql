-- Staff confirm or decline property manager turnover requests.

-- AlterTable
ALTER TABLE "PropertyManagerRequest" ADD COLUMN     "confirmedEndDate" TIMESTAMP(3),
ADD COLUMN     "confirmedStartDate" TIMESTAMP(3),
ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decidedBy" TEXT,
ADD COLUMN     "declineReason" TEXT,
ADD COLUMN     "priceCents" INTEGER,
ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "staffMessage" TEXT;

