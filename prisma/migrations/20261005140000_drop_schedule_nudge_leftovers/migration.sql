-- The PM schedule popup and its "Not today" button were removed, and the
-- COI request notify address moved into NotificationSetting. Applied by the
-- deploy build, after the code that used these is gone.

-- DropForeignKey
ALTER TABLE "ProjectScheduleNudgeDismissal" DROP CONSTRAINT "ProjectScheduleNudgeDismissal_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectScheduleNudgeDismissal" DROP CONSTRAINT "ProjectScheduleNudgeDismissal_dismissedByUserId_fkey";

-- DropTable
DROP TABLE "ProjectScheduleNudgeDismissal";

DELETE FROM "AppSetting" WHERE "key" = 'coiRequestNotifyEmail';
