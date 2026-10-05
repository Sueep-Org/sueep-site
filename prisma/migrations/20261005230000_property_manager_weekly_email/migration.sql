-- Monday turnover email to property managers.

-- AlterTable
ALTER TABLE "PropertyManager" ADD COLUMN     "weeklyEmail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "weeklyEmailSentAt" TIMESTAMP(3);

