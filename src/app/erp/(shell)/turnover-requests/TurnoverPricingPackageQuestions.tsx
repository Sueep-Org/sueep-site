"use client";

import { computeTurnoverPricing } from "@/lib/turnoverPricing";
import { getTurnoverPricingPackage } from "@/lib/turnoverPricingPackages";

const UNIT_LAYOUTS = [
  { label: "1/1", bedrooms: "1", bathrooms: "1" },
  { label: "2/1", bedrooms: "2", bathrooms: "1" },
  { label: "2/2", bedrooms: "2", bathrooms: "2" },
  { label: "3/2", bedrooms: "3", bathrooms: "2" },
  { label: "3/1", bedrooms: "3", bathrooms: "1" },
] as const;

type CommonAreaRates = {
  fullClean: string;
  fullPaint: string;
  touchUpPaint: string;
  carpetCleaning: string;
  additionalMaterials: string;
};

type TurnoverPricingPackageQuestionsProps = {
  buildingName?: string | null;
  pricingPackage?: unknown;
  bedrooms: string;
  bathrooms: string;
  isCommonArea?: boolean;
  commonAreaRates?: CommonAreaRates;
  setCommonAreaRates?: (rates: CommonAreaRates) => void;
  fullPaint: boolean;
  touchUpPaint: string;
  fullClean: boolean;
  carpetCleaning: boolean;
  materialsAdditional: boolean;
  otherWork?: boolean;
  otherDescription?: string;
  otherPrice?: string;
  setBedrooms: (value: string) => void;
  setBathrooms: (value: string) => void;
  setIsCommonArea?: (value: boolean) => void;
  setFullPaint: (value: boolean) => void;
  setTouchUpPaint: (value: string) => void;
  setFullClean: (value: boolean) => void;
  setCarpetCleaning: (value: boolean) => void;
  setMaterialsAdditional: (value: boolean) => void;
  setOtherWork?: (value: boolean) => void;
  setOtherDescription?: (value: string) => void;
  setOtherPrice?: (value: string) => void;
};

function parseNullableNumber(value: string) {
  if (value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dollarsToCents(value: string): number {
  const parsed = Number(value.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

export function TurnoverPricingPackageQuestions({
  buildingName,
  pricingPackage: storedPricingPackage,
  bedrooms,
  bathrooms,
  isCommonArea = false,
  commonAreaRates,
  setCommonAreaRates,
  fullPaint,
  touchUpPaint,
  fullClean,
  carpetCleaning,
  materialsAdditional,
  otherWork = false,
  otherDescription = "",
  otherPrice = "",
  setBedrooms,
  setBathrooms,
  setIsCommonArea = () => {},
  setFullPaint,
  setTouchUpPaint,
  setFullClean,
  setCarpetCleaning,
  setMaterialsAdditional,
  setOtherWork = () => {},
  setOtherDescription = () => {},
  setOtherPrice = () => {},
}: TurnoverPricingPackageQuestionsProps) {
  const pricingPackage = getTurnoverPricingPackage(buildingName, storedPricingPackage);
  const n = (v: string | undefined) => Math.max(0, Math.round(Number((v ?? "0").replace(/[$,\s]/g, "")) || 0));
  const commonAreaPricingPackage = isCommonArea && commonAreaRates
    ? {
        ...pricingPackage,
        cleaningLayoutRates: { "common-area": n(commonAreaRates.fullClean) },
        paintingLayoutRates: { "common-area": n(commonAreaRates.fullPaint) },
        touchUpPaintLayoutRates: { "common-area": n(commonAreaRates.touchUpPaint) },
        carpetCleaningLayoutRates: { "common-area": n(commonAreaRates.carpetCleaning) },
        additionalMaterialsLayoutRates: { "common-area": n(commonAreaRates.additionalMaterials) },
      }
    : storedPricingPackage;
  const basePricing = computeTurnoverPricing({
    requestType: "TURNOVER",
    buildingName,
    pricingPackage: commonAreaPricingPackage,
    bedrooms: parseNullableNumber(bedrooms),
    bathrooms: parseNullableNumber(bathrooms),
    isCommonArea,
    fullPaint,
    touchUpPaint: parseNullableNumber(touchUpPaint) ?? 0,
    fullClean,
    carpetCleaning,
    materialsAdditional,
  });
  const otherCents = otherWork ? dollarsToCents(otherPrice) : 0;
  const pricing = { ...basePricing, priceCents: basePricing.priceCents + otherCents };
  const totalLabel = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(pricing.priceCents / 100);

  const selectedLayout = isCommonArea
    ? "Common Area"
    : UNIT_LAYOUTS.find((layout) => layout.bedrooms === bedrooms && layout.bathrooms === bathrooms)?.label;

  function selectLayout(layout: (typeof UNIT_LAYOUTS)[number]) {
    setIsCommonArea(false);
    setBedrooms(layout.bedrooms);
    setBathrooms(layout.bathrooms);
  }

  function selectCommonArea() {
    setIsCommonArea(true);
    setBedrooms("");
    setBathrooms("");
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Price package</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">{pricingPackage.label}</p>
        </div>
        <span className="rounded bg-pink-50 px-2.5 py-1 text-sm font-semibold text-pink-700">
          {totalLabel}
        </span>
      </div>

      <label className="mt-4 block text-xs font-medium text-gray-600">
        Unit type
        <select
          value={selectedLayout ?? ""}
          onChange={(event) => {
            if (event.target.value === "Common Area") { selectCommonArea(); return; }
            const layout = UNIT_LAYOUTS.find((option) => option.label === event.target.value);
            if (layout) selectLayout(layout);
          }}
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
        >
          <option value="">Select unit type...</option>
          {UNIT_LAYOUTS.map((layout) => (
            <option key={layout.label} value={layout.label}>
              {layout.label}
            </option>
          ))}
          <option value="Common Area">Common Area</option>
        </select>
      </label>

      {!isCommonArea && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-gray-600">
            Bedrooms
            <input
              name="bedrooms"
              value={bedrooms}
              onChange={(event) => setBedrooms(event.target.value)}
              type="number"
              min="0"
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
          </label>
          <label className="block text-xs font-medium text-gray-600">
            Bathrooms
            <input
              name="bathrooms"
              value={bathrooms}
              onChange={(event) => setBathrooms(event.target.value)}
              type="number"
              min="0"
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
          </label>
        </div>
      )}

      {isCommonArea && commonAreaRates && setCommonAreaRates && (
        <div className="mt-4 rounded-md border border-blue-100 bg-blue-50 p-3">
          <p className="mb-2 text-xs font-semibold text-blue-800">Common area rates ($ per service)</p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {([
              { key: "fullClean", label: "Full clean" },
              { key: "fullPaint", label: "Full paint" },
              { key: "touchUpPaint", label: "Touch-up paint" },
              { key: "carpetCleaning", label: "Carpet cleaning" },
              { key: "additionalMaterials", label: "Add. materials" },
            ] as const).map(({ key, label }) => (
              <label key={key} className="block text-[11px] font-medium text-blue-700">
                {label}
                <div className="relative mt-0.5">
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={commonAreaRates[key]}
                    onChange={(e) => setCommonAreaRates({ ...commonAreaRates, [key]: e.target.value })}
                    className="w-full rounded border border-blue-200 bg-white py-1 pl-5 pr-2 text-xs text-gray-900 focus:border-blue-400 focus:outline-none"
                  />
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <p className="text-xs font-semibold text-gray-700">What work is included?</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <input
              name="fullClean"
              checked={fullClean}
              onChange={(event) => setFullClean(event.target.checked)}
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-pink-600"
            />
            Full clean
          </label>
          <label className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <input
              name="fullPaint"
              checked={fullPaint}
              onChange={(event) => {
                setFullPaint(event.target.checked);
                if (event.target.checked) setTouchUpPaint("");
              }}
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-pink-600"
            />
            Full paint
          </label>
          <label className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <input
              name="carpetCleaning"
              checked={carpetCleaning}
              onChange={(event) => setCarpetCleaning(event.target.checked)}
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-pink-600"
            />
            Carpet cleaning
          </label>
          <label className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <input
              name="materialsAdditional"
              checked={materialsAdditional}
              onChange={(event) => setMaterialsAdditional(event.target.checked)}
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-pink-600"
            />
            Additional materials
          </label>
          <label className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <input
              name="otherWork"
              checked={otherWork}
              onChange={(event) => {
                setOtherWork(event.target.checked);
                if (!event.target.checked) { setOtherDescription(""); setOtherPrice(""); }
              }}
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-pink-600"
            />
            Other
          </label>
        </div>
        {otherWork && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-gray-600">
              Describe the other work
              <input
                value={otherDescription}
                onChange={(e) => setOtherDescription(e.target.value)}
                placeholder="e.g. Window cleaning"
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              />
            </label>
            <label className="block text-xs font-medium text-gray-600">
              Price ($)
              <input
                type="number"
                min={0}
                step="0.01"
                value={otherPrice}
                onChange={(e) => setOtherPrice(e.target.value)}
                placeholder="0.00"
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              />
            </label>
          </div>
        )}
      </div>

      <label className="mt-4 block text-xs font-medium text-gray-600">
        Touch-up paint quantity
        <input
          name="touchUpPaint"
          value={touchUpPaint}
          onChange={(event) => setTouchUpPaint(event.target.value)}
          type="number"
          min="0"
          disabled={fullPaint}
          placeholder={fullPaint ? "Included in full paint" : "0"}
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
        />
      </label>

      <div className="mt-4 rounded-md bg-gray-50 px-3 py-2">
        <p className="text-xs font-semibold text-gray-700">Pricing breakdown</p>
        <ul className="mt-1 space-y-0.5 text-xs text-gray-600">
          {basePricing.breakdown.map((line) => (
            <li key={line}>{line}</li>
          ))}
          {otherWork && otherCents > 0 && (
            <li>{otherDescription.trim() || "Other"}: {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(otherCents / 100)}</li>
          )}
        </ul>
      </div>
    </div>
  );
}
