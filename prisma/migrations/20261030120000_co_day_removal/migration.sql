-- Change order days taken off the schedule for a reason (see src/lib/erp/scheduleRemovals.ts).
ALTER TABLE "ScheduleDayRemoval" ADD COLUMN "changeOrderId" TEXT;
ALTER TABLE "ScheduleDayRemoval" ADD CONSTRAINT "ScheduleDayRemoval_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ProjectChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
