import Link from "next/link";
import { UnitScopeCard } from "../../projects/[id]/UnitScopeCard";
import { AddUnitForm } from "./AddUnitForm";

export type BuildingUnit = {
  projectId: string;
  status: string;
  unitNumber: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  isPartialTurn?: boolean;
  partialTurnLayout?: string | null;
  sqft: number | null;
  unitQuality: string | null;
  fullClean: boolean;
  fullPaint: boolean;
  touchUpPaint: number | null;
  carpetCleaning: boolean;
  materialsAdditional: boolean;
  ceilingPaint: boolean;
  compounding: number | null;
  otherWork: boolean;
  otherDescription: string | null;
};

type Props = {
  buildingId: string;
  units: BuildingUnit[];
  canAdd: boolean;
};

export function BuildingUnitsSection({ buildingId, units, canAdd }: Props) {
  return (
    <div className="space-y-4">
      {canAdd && <AddUnitForm buildingId={buildingId} />}

      {units.length === 0 ? (
        <p className="text-sm text-gray-400">No units added yet.</p>
      ) : (
        <div className="space-y-3">
          {units.map((unit) => (
            <Link key={unit.projectId} href={`/erp/projects/${unit.projectId}`} className="block transition hover:opacity-80">
              <UnitScopeCard
                unitNumber={unit.unitNumber}
                bedrooms={unit.bedrooms}
                bathrooms={unit.bathrooms}
                isPartialTurn={unit.isPartialTurn}
                partialTurnLayout={unit.partialTurnLayout}
                sqft={unit.sqft}
                unitQuality={unit.unitQuality}
                fullClean={unit.fullClean}
                fullPaint={unit.fullPaint}
                touchUpPaint={unit.touchUpPaint}
                carpetCleaning={unit.carpetCleaning}
                materialsAdditional={unit.materialsAdditional}
                ceilingPaint={unit.ceilingPaint}
                compounding={unit.compounding}
                otherWork={unit.otherWork}
                otherDescription={unit.otherDescription}
                contractValueCents={null}
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
