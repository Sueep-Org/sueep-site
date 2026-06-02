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

type TurnoverPricingPackageQuestionsProps = {
  buildingName?: string | null;
  bedrooms: string;
  bathrooms: string;
  fullPaint: boolean;
  touchUpPaint: string;
  fullClean: boolean;
  carpetCleaning: boolean;
  materialsAdditional: boolean;
  setBedrooms: (value: string) => void;
  setBathrooms: (value: string) => void;
  setFullPaint: (value: boolean) => void;
  setTouchUpPaint: (value: string) => void;
  setFullClean: (value: boolean) => void;
  setCarpetCleaning: (value: boolean) => void;
  setMaterialsAdditional: (value: boolean) => void;
};

function parseNullableNumber(value: string) {
  if (value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function TurnoverPricingPackageQuestions({
  buildingName,
  bedrooms,
  bathrooms,
  fullPaint,
  touchUpPaint,
  fullClean,
  carpetCleaning,
  materialsAdditional,
  setBedrooms,
  setBathrooms,
  setFullPaint,
  setTouchUpPaint,
  setFullClean,
  setCarpetCleaning,
  setMaterialsAdditional,
}: TurnoverPricingPackageQuestionsProps) {
  const pricingPackage = getTurnoverPricingPackage(buildingName);
  const pricing = computeTurnoverPricing({
    requestType: "TURNOVER",
    buildingName,
    bedrooms: parseNullableNumber(bedrooms),
    bathrooms: parseNullableNumber(bathrooms),
    fullPaint,
    touchUpPaint: parseNullableNumber(touchUpPaint) ?? 0,
    fullClean,
    carpetCleaning,
    materialsAdditional,
  });
  const selectedLayout = UNIT_LAYOUTS.find(
    (layout) => layout.bedrooms === bedrooms && layout.bathrooms === bathrooms
  )?.label;

  function selectLayout(layout: (typeof UNIT_LAYOUTS)[number]) {
    setBedrooms(layout.bedrooms);
    setBathrooms(layout.bathrooms);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Price package</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">{pricingPackage.label}</p>
        </div>
        <span className="rounded bg-pink-50 px-2.5 py-1 text-sm font-semibold text-pink-700">
          {pricing.priceLabel}
        </span>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold text-gray-700">What unit type is it?</p>
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {UNIT_LAYOUTS.map((layout) => {
            const isSelected = selectedLayout === layout.label;
            return (
              <button
                key={layout.label}
                type="button"
                onClick={() => selectLayout(layout)}
                className={`rounded-md border px-2 py-2 text-xs font-semibold transition-colors ${
                  isSelected
                    ? "border-pink-500 bg-pink-50 text-pink-700"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                {layout.label}
              </button>
            );
          })}
        </div>
      </div>

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
        </div>
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
          {pricing.breakdown.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
