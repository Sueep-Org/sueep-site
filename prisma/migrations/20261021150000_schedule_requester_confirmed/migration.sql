-- Who asked for a scheduled day, so they hear when the whole day is confirmed. Additive only.

-- AlterTable
ALTER TABLE "ProjectDayAssignment" ADD COLUMN "requesterName" TEXT,
ADD COLUMN "requesterEmail" TEXT,
ADD COLUMN "requesterNotifiedFor" TEXT;

-- AlterTable
ALTER TABLE "ChangeOrderDayAssignment" ADD COLUMN "requesterNotifiedFor" TEXT;
