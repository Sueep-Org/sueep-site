-- Next day upcharge, already included in the price (see src/lib/nextDayUpcharge.ts).
ALTER TABLE "TurnoverRequest" ADD COLUMN "nextDayUpcharge" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProjectChangeOrder" ADD COLUMN "nextDayUpcharge" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PropertyManagerRequest" ADD COLUMN "nextDayUpcharge" BOOLEAN NOT NULL DEFAULT false;
