type Props = {
  unitNumber: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  fullClean: boolean;
  fullPaint: boolean;
  touchUpPaint: number | null;
  carpetCleaning: boolean;
  materialsAdditional: boolean;
  ceilingPaint: boolean;
  otherWork: boolean;
  otherDescription: string | null;
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
  fullClean,
  fullPaint,
  touchUpPaint,
  carpetCleaning,
  materialsAdditional,
  ceilingPaint,
  otherWork,
  otherDescription,
}: Props) {
  const workItems = [
    fullClean ? "Full Clean" : null,
    fullPaint ? "Full Paint" : null,
    touchUpPaint ? `Touch-Up Paint (${touchUpPaint} rooms)` : null,
    carpetCleaning ? "Carpet Cleaning" : null,
    materialsAdditional ? "Materials" : null,
    ceilingPaint ? "Ceiling Painting" : null,
    otherWork ? (otherDescription?.trim() || "Other") : null,
  ].filter(Boolean) as string[];

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
      </div>

      {workItems.length > 0 ? (
        <div className="px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 mb-2">Work scope</p>
          <ul className="space-y-1.5">
            {workItems.map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-gray-700">
                <Check />
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="px-4 py-3 text-sm text-gray-400">No work items selected.</div>
      )}
    </div>
  );
}
