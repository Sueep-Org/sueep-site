"use client";

import { computeTurnoverPricing } from "@/lib/turnoverPricing";
import { CUSTOM_LINE_ITEMS_ENABLED, getTurnoverPricingPackage, TURNOVER_UNIT_LAYOUTS } from "@/lib/turnoverPricingPackages";

const PARTIAL_TURN_LAYOUT_OPTIONS = TURNOVER_UNIT_LAYOUTS.filter((l) => l !== "common-area");
const LAYOUT_LABELS: Record<string, string> = {
  "studio": "Studio",
  "1/1": "1BR/1BA",
  "2/1": "2BR/1BA",
  "2/2": "2BR/2BA",
  "3/1": "3BR/1BA",
  "3/2": "3BR/2BA",
  "3/3": "3BR/3BA",
};

type CommonAreaRates = {
  fullClean: string;
  fullPaint: string;
  touchUpPaint: string;
  carpetCleaning: string;
  additionalMaterials: string;
  ceilingPaint: string;
  compounding: string;
};

type TurnoverPricingPackageQuestionsProps = {
  buildingName?: string | null;
  pricingPackage?: unknown;
  bedrooms: string;
  bathrooms: string;
  isCommonArea?: boolean;
  commonAreaRates?: CommonAreaRates;
  setCommonAreaRates?: (rates: CommonAreaRates) => void;
  isPartialTurn?: boolean;
  setIsPartialTurn?: (value: boolean) => void;
  partialTurnLayout?: string;
  setPartialTurnLayout?: (value: string) => void;
  fullPaint: boolean;
  touchUpPaint: string;
  fullClean: boolean;
  carpetCleaning: boolean;
  materialsAdditional: boolean;
  ceilingPaint: boolean;
  compounding: string;
  otherWork?: boolean;
  otherDescription?: string;
  otherPrice?: string;
  selectedCustomLineItemIds?: string[];
  setSelectedCustomLineItemIds?: (value: string[]) => void;
  setBedrooms: (value: string) => void;
  setBathrooms: (value: string) => void;
  setIsCommonArea?: (value: boolean) => void;
  setFullPaint: (value: boolean) => void;
  setTouchUpPaint: (value: string) => void;
  setFullClean: (value: boolean) => void;
  setCarpetCleaning: (value: boolean) => void;
  setMaterialsAdditional: (value: boolean) => void;
  setCeilingPaint: (value: boolean) => void;
  setCompounding: (value: string) => void;
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
  isPartialTurn = false,
  setIsPartialTurn = () => {},
  partialTurnLayout = "",
  setPartialTurnLayout = () => {},
  fullPaint,
  touchUpPaint,
  fullClean,
  carpetCleaning,
  materialsAdditional,
  ceilingPaint,
  compounding,
  otherWork = false,
  otherDescription = "",
  otherPrice = "",
  selectedCustomLineItemIds = [],
  setSelectedCustomLineItemIds = () => {},
  setBedrooms,
  setBathrooms,
  setIsCommonArea = () => {},
  setFullPaint,
  setTouchUpPaint,
  setFullClean,
  setCarpetCleaning,
  setMaterialsAdditional,
  setCeilingPaint,
  setCompounding,
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
        ceilingPaintLayoutRates: { "common-area": n(commonAreaRates.ceilingPaint) },
        compoundingLayoutRates: { "common-area": n(commonAreaRates.compounding) },
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
    ceilingPaint,
    compounding: parseNullableNumber(compounding) ?? 0,
    isPartialTurn,
    partialTurnLayout,
    selectedCustomLineItemIds,
  });
  const otherCents = otherWork ? dollarsToCents(otherPrice) : 0;
  const pricing = { ...basePricing, priceCents: basePricing.priceCents + otherCents };
  const totalLabel = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(pricing.priceCents / 100);

  function toggleCommonArea(checked: boolean) {
    setIsCommonArea(checked);
    if (checked) {
      setBedrooms("");
      setBathrooms("");
      setIsPartialTurn(false);
      setPartialTurnLayout("");
    }
  }

  function toggleCustomLineItem(id: string, checked: boolean) {
    setSelectedCustomLineItemIds(
      checked ? [...selectedCustomLineItemIds, id] : selectedCustomLineItemIds.filter((v) => v !== id)
    );
  }

  function togglePartialTurn(checked: boolean) {
    setIsPartialTurn(checked);
    if (checked) {
      toggleCommonArea(false);
    } else {
      setPartialTurnLayout("");
    }
  }

  // Touch-up paint and compounding are "how many" (rooms/spots), not a
  // plain yes/no, so they can't be checkbox-driven the same way Full clean
  // etc. are — but living as bare quantity fields below the "what work is
  // included?" grid made them easy to miss entirely (matching neither the
  // checkbox styling nor being visually grouped with it). Deriving a
  // checked state from quantity > 0 lets them sit as a checkbox in that
  // same grid; checking it just seeds a starting quantity of 1, unchecking
  // zeroes it back out — same on/off shape as every other tile there.
  const touchUpPaintChecked = !fullPaint && Number(touchUpPaint || 0) > 0;
  const compoundingChecked = Number(compounding || 0) > 0;

  function toggleTouchUpPaint(checked: boolean) {
    setTouchUpPaint(checked ? (Number(touchUpPaint || 0) > 0 ? touchUpPaint : "1") : "0");
  }

  function toggleCompounding(checked: boolean) {
    setCompounding(checked ? (Number(compounding || 0) > 0 ? compounding : "1") : "0");
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

      <label className="mt-4 flex items-center">
        <input
          type="checkbox"
          checked={isCommonArea}
          onChange={(event) => toggleCommonArea(event.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-pink-600"
        />
        <span className="ml-2 text-sm text-gray-700">Common area</span>
      </label>

      {!isCommonArea && (
        <label className="mt-2 flex items-center">
          <input
            type="checkbox"
            checked={isPartialTurn}
            onChange={(event) => togglePartialTurn(event.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-pink-600"
          />
          <span className="ml-2 text-sm text-gray-700">Partial turn</span>
        </label>
      )}

      {isPartialTurn && !isCommonArea && (
        <label className="mt-2 block text-xs font-medium text-gray-600">
          Price as
          <select
            value={partialTurnLayout}
            onChange={(event) => setPartialTurnLayout(event.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          >
            <option value="">Select a layout...</option>
            {PARTIAL_TURN_LAYOUT_OPTIONS.map((l) => (
              <option key={l} value={l}>{LAYOUT_LABELS[l] ?? l}</option>
            ))}
          </select>
        </label>
      )}

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
              { key: "ceilingPaint", label: "Ceiling painting" },
              { key: "compounding", label: "Compounding" },
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
          <label className={`flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm ${fullPaint ? "bg-gray-100 text-gray-400" : "bg-gray-50 text-gray-700"}`}>
            <input
              name="touchUpPaintToggle"
              checked={touchUpPaintChecked}
              disabled={fullPaint}
              onChange={(event) => toggleTouchUpPaint(event.target.checked)}
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-pink-600"
            />
            Touch-up paint{fullPaint ? " (included in full paint)" : ""}
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
              name="ceilingPaint"
              checked={ceilingPaint}
              onChange={(event) => setCeilingPaint(event.target.checked)}
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-pink-600"
            />
            Ceiling painting
          </label>
          <label className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <input
              name="compoundingToggle"
              checked={compoundingChecked}
              onChange={(event) => toggleCompounding(event.target.checked)}
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-pink-600"
            />
            Compounding
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
        {touchUpPaintChecked && (
          <label className="mt-3 block text-xs font-medium text-gray-600">
            Touch-up paint — how many rooms?
            <input
              name="touchUpPaint"
              value={touchUpPaint}
              onChange={(event) => setTouchUpPaint(event.target.value)}
              type="number"
              min="1"
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
          </label>
        )}
        {compoundingChecked && (
          <label className="mt-3 block text-xs font-medium text-gray-600">
            Compounding — how many spots?
            <input
              name="compounding"
              value={compounding}
              onChange={(event) => setCompounding(event.target.value)}
              type="number"
              min="1"
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
          </label>
        )}
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

      {CUSTOM_LINE_ITEMS_ENABLED && (["charge", "workItem"] as const).map((kind) => {
        const items = pricingPackage.customLineItems?.filter((item) => item.kind === kind) ?? [];
        if (items.length === 0) return null;
        return (
          <div key={kind} className="mt-4">
            <p className="text-xs font-semibold text-gray-700">
              {kind === "charge" ? "Extra charges" : "Additional work"}
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {items.map((item) => (
                <label key={item.id} className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  <input
                    checked={selectedCustomLineItemIds.includes(item.id)}
                    onChange={(event) => toggleCustomLineItem(item.id, event.target.checked)}
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-pink-600"
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </div>
        );
      })}

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
