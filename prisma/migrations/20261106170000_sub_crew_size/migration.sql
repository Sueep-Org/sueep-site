-- Sub portal Phase 4: crew size the sub running a day is bringing
ALTER TABLE "ProjectDayAssignment" ADD COLUMN "subCrewCount" INTEGER;
ALTER TABLE "ProjectDayAssignment" ADD COLUMN "subCrewNames" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ProjectDayAssignment" ADD COLUMN "subCrewContractorId" TEXT;
ALTER TABLE "ProjectDayAssignment" ADD COLUMN "subCrewSetAt" TIMESTAMP(3);
ALTER TABLE "ChangeOrderDayAssignment" ADD COLUMN "subCrewCount" INTEGER;
ALTER TABLE "ChangeOrderDayAssignment" ADD COLUMN "subCrewNames" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ChangeOrderDayAssignment" ADD COLUMN "subCrewContractorId" TEXT;
ALTER TABLE "ChangeOrderDayAssignment" ADD COLUMN "subCrewSetAt" TIMESTAMP(3);
