-- AlterTable
ALTER TABLE "SubCheckIn" ADD COLUMN     "wrapUpAt" TIMESTAMP(3),
ADD COLUMN     "wrapUpItems" JSONB,
ADD COLUMN     "wrapUpNote" TEXT,
ADD COLUMN     "wrapUpEmailAt" TIMESTAMP(3),
ADD COLUMN     "wrapUpReminderAt" TIMESTAMP(3);
