-- Pay typed on the schedule's day card (see src/lib/erp/subPay.ts).
ALTER TABLE "ContractorAssignment" ADD COLUMN "setOnSchedule" BOOLEAN NOT NULL DEFAULT false;

-- Lines the day card made before this column existed carry its note.
UPDATE "ContractorAssignment" SET "setOnSchedule" = true WHERE "notes" = 'Pay set on the schedule';
