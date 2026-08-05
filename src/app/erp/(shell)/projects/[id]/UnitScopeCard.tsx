import { turnoverHoursBudget } from "@/lib/erp/turnoverHoursBudget";
import type { TurnoverScopeValue } from "@/lib/erp/turnoverScope";

const UNIT_QUALITY_LABELS: Record<string, string> = { GOOD: "Good", FAIR: "Fair", POOR: "Poor" };
const PARTIAL_TURN_LAYOUT_LABELS: Record<string, string> = {
  "studio": "Studio",
  "1/1": "1BR/1BA",
  "2/1": "2BR/1BA",
  "2/2": "2BR/2BA",
  "3/1": "3BR/1BA",
  "3/2": "3BR/2BA",
  "3/3": "3BR/3BA",
};

type Props = {
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
  otherWork: boolean;
  otherDescription: string | null;
  contractValueCents: number | null;
  /** Which contracted scope items are actually finished (already resolved to
   * "everything" when the unit's overall status is COMPLETED). Omit to fall
   * back to the plain "in scope" checkmarks with no done/pending status. */
  completedScopeItems?: string[];
};

function Check() {
  return (
    <svg className="h-4 w-4 text-emerald-500 shrink-0" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" fill="#ecfdf5" stroke="#a7f3d0" strokeWidth="1" />
      <path d="M5 8l2 2 4-4" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function UnitScopeCard({
  unitNumber,
  bedrooms,
  bathrooms,
  isPartialTurn = false,
  partialTurnLayout = null,
  sqft,
  unitQuality,
  fullClean,
  fullPaint,
  touchUpPaint,
  carpetCleaning,
  materialsAdditional,
  ceilingPaint,
  otherWork,
  otherDescription,
  contractValueCents,
  completedScopeItems,
}: Props) {
  const workItems: { label: string; scopeValue: TurnoverScopeValue }[] = [
    fullClean ? { label: "Full Clean", scopeValue: "CLEAN" as const } : null,
    fullPaint ? { label: "Full Paint", scopeValue: "PAINT" as const } : null,
    touchUpPaint ? { label: `Touch-Up Paint (${touchUpPaint} rooms)`, scopeValue: "TOUCH_UP_PAINT" as const } : null,
    carpetCleaning ? { label: "Carpet Cleaning", scopeValue: "CARPET" as const } : null,
    materialsAdditional ? { label: "Materials", scopeValue: "MATERIALS" as const } : null,
    ceilingPaint ? { label: "Ceiling Painting", scopeValue: "CEILING_PAINT" as const } : null,
    otherWork ? { label: otherDescription?.trim() || "Other", scopeValue: "OTHER" as const } : null,
  ].filter((v): v is { label: string; scopeValue: TurnoverScopeValue } => v !== null);

  const isCommonArea = bedrooms === null && bathrooms === null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center gap-3">
        {unitNumber && (
          <span className="text-sm font-semibold text-gray-800">{isCommonArea ? unitNumber : `Unit ${unitNumber}`}</span>
        )}
        {isCommonArea ? (
          <span className="text-sm text-gray-600">Common Area</span>
        ) : (
          <>
            {(bedrooms != null || bathrooms != null) && (
              <span className="text-xs text-gray-400">·</span>
            )}
            {bedrooms != null && (
              <span className="text-sm text-gray-600">{bedrooms} Bedroom{bedrooms !== 1 ? "s" : ""}</span>
            )}
            {bathrooms != null && (
              <>
                <span className="text-xs text-gray-400">·</span>
                <span className="text-sm text-gray-600">{bathrooms} Bathroom{bathrooms !== 1 ? "s" : ""}</span>
              </>
            )}
          </>
        )}
        {sqft != null && (
          <>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-sm text-gray-600">{sqft.toLocaleString()} sq ft</span>
          </>
        )}
        {unitQuality && (
          <>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-sm text-gray-600">{UNIT_QUALITY_LABELS[unitQuality] ?? unitQuality} condition</span>
          </>
        )}
      </div>

      {isPartialTurn && (
        <div className="bg-amber-50 border-b border-amber-100 px-4 py-2">
          <span className="text-sm font-semibold text-amber-800">
            Partial Turn{partialTurnLayout ? ` — working on ${PARTIAL_TURN_LAYOUT_LABELS[partialTurnLayout] ?? partialTurnLayout}` : ""}
          </span>
        </div>
      )}

      {workItems.length > 0 ? (
        <div className="px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 mb-2">Work scope</p>
          <ul className="space-y-1.5">
            {workItems.map((item) => {
              const isDone = completedScopeItems?.includes(item.scopeValue);
              return (
                <li key={item.scopeValue} className="flex items-center gap-2 text-sm text-gray-700">
                  <Check />
                  <span className={isDone ? "text-gray-400 line-through" : undefined}>{item.label}</span>
                  {completedScopeItems ? (
                    <span className={`ml-auto text-xs font-medium ${isDone ? "text-emerald-600" : "text-amber-600"}`}>
                      {isDone ? "Done" : "Pending"}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="px-4 py-3 text-sm text-gray-400">No work items selected.</div>
      )}

      {contractValueCents != null && contractValueCents > 0 && (
        <div className="px-4 py-3 border-t border-gray-100">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 mb-2">
            Crew hours budget (target: 50% margin)
          </p>
          <div className="flex gap-4">
            {[1, 2, 3].map((crewSize) => (
              <div key={crewSize} className="text-sm">
                <span className="text-gray-500">{crewSize} worker{crewSize > 1 ? "s" : ""}:</span>{" "}
                <span className="font-semibold text-gray-800">
                  {turnoverHoursBudget(contractValueCents, crewSize).toFixed(1)} hrs
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
