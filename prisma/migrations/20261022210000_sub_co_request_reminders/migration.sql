-- Sub CO requests: property manager reminder tracking. Additive only.

-- AlterTable
ALTER TABLE "SubCoRequest" ADD COLUMN     "pmRemindedAt" TIMESTAMP(3),
ADD COLUMN     "pmReminderCount" INTEGER NOT NULL DEFAULT 0;

