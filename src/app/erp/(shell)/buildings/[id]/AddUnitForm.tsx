"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  buildingId: string;
};

const checkboxRow = "flex items-center gap-2 text-sm text-gray-700";
const checkboxInput = "h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500";
const label = "block text-xs font-medium text-gray-600";
const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";

/**
 * Deliberately minimal next to UnitScopeEditor (the PM-facing Layout tab
 * editor): no pricing package, no rate figures anywhere, no "Other work"
 * dollar amount. Scope answers alone are enough — the building's existing
 * pricing package prices the unit automatically once created.
 */
export function AddUnitForm({ buildingId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unitNumber, setUnitNumber] = useState("");
  const [isCommonArea, setIsCommonArea] = useState(false);
  const [bedrooms, setBedrooms] = useState("1");
  const [bathrooms, setBathrooms] = useState("1");
  const [sqft, setSqft] = useState("");
  const [unitQuality, setUnitQuality] = useState("");
  const [fullClean, setFullClean] = useState(false);
  const [fullPaint, setFullPaint] = useState(false);
  const [touchUpPaint, setTouchUpPaint] = useState(false);
  const [carpetCleaning, setCarpetCleaning] = useState(false);
  const [materialsAdditional, setMaterialsAdditional] = useState(false);
  const [ceilingPaint, setCeilingPaint] = useState(false);
  const [otherWork, setOtherWork] = useState(false);
  const [otherDescription, setOtherDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setUnitNumber("");
    setIsCommonArea(false);
    setBedrooms("1");
    setBathrooms("1");
    setSqft("");
    setUnitQuality("");
    setFullClean(false);
    setFullPaint(false);
    setTouchUpPaint(false);
    setCarpetCleaning(false);
    setMaterialsAdditional(false);
    setCeilingPaint(false);
    setOtherWork(false);
    setOtherDescription("");
    setStartDate("");
    setError("");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!startDate) {
      setError("Start date is required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/erp/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          segment: "JANITORIAL_TURNOVER_REQUESTS",
          buildingId,
          unitScopes: [
            {
              unitNumber: unitNumber.trim() || undefined,
              isCommonArea,
              bedrooms: isCommonArea ? null : Number(bedrooms) || 1,
              bathrooms: isCommonArea ? null : Number(bathrooms) || 1,
              sqft: sqft.trim() ? Number(sqft) : null,
              unitQuality: unitQuality || null,
              fullClean,
              fullPaint,
              touchUpPaint,
              carpetCleaning,
              materialsAdditional,
              ceilingPaint,
              otherWork,
              otherDescription: otherWork ? otherDescription.trim() || null : null,
              startDate,
            },
          ],
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to add unit");
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-500"
      >
        + Add unit
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">New unit</h3>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="text-xs font-medium text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>

      <div>
        <label className={label} htmlFor="au-unit-number">Unit identifier</label>
        <input
          id="au-unit-number"
          type="text"
          value={unitNumber}
          onChange={(e) => setUnitNumber(e.target.value)}
          placeholder="e.g. 4B"
          className={input}
        />
      </div>

      <label className={checkboxRow}>
        <input
          type="checkbox"
          checked={isCommonArea}
          onChange={(e) => setIsCommonArea(e.target.checked)}
          className={checkboxInput}
        />
        This is a common area, not a residential unit
      </label>

      {!isCommonArea && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="au-bedrooms">Bedrooms</label>
            <input
              id="au-bedrooms"
              type="number"
              min={0}
              value={bedrooms}
              onChange={(e) => setBedrooms(e.target.value)}
              className={input}
            />
          </div>
          <div>
            <label className={label} htmlFor="au-bathrooms">Bathrooms</label>
            <input
              id="au-bathrooms"
              type="number"
              min={0}
              value={bathrooms}
              onChange={(e) => setBathrooms(e.target.value)}
              className={input}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="au-sqft">Square footage</label>
          <input
            id="au-sqft"
            type="number"
            min={0}
            value={sqft}
            onChange={(e) => setSqft(e.target.value)}
            placeholder="Optional"
            className={input}
          />
        </div>
        <div>
          <label className={label} htmlFor="au-quality">Unit condition</label>
          <select id="au-quality" value={unitQuality} onChange={(e) => setUnitQuality(e.target.value)} className={input}>
            <option value="">Not specified</option>
            <option value="GOOD">Good</option>
            <option value="FAIR">Fair</option>
            <option value="POOR">Poor</option>
          </select>
        </div>
      </div>

      <div>
        <label className={label} htmlFor="au-start-date">Start date</label>
        <input
          id="au-start-date"
          type="date"
          required
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className={input}
        />
      </div>

      <div>
        <p className={label}>Scope of work</p>
        <div className="mt-1.5 space-y-1.5">
          <label className={checkboxRow}>
            <input type="checkbox" checked={fullClean} onChange={(e) => setFullClean(e.target.checked)} className={checkboxInput} />
            Full clean
          </label>
          <label className={checkboxRow}>
            <input type="checkbox" checked={fullPaint} onChange={(e) => setFullPaint(e.target.checked)} className={checkboxInput} />
            Full paint
          </label>
          {!fullPaint && (
            <label className={checkboxRow}>
              <input type="checkbox" checked={touchUpPaint} onChange={(e) => setTouchUpPaint(e.target.checked)} className={checkboxInput} />
              Touch-up paint
            </label>
          )}
          <label className={checkboxRow}>
            <input type="checkbox" checked={carpetCleaning} onChange={(e) => setCarpetCleaning(e.target.checked)} className={checkboxInput} />
            Carpet cleaning
          </label>
          <label className={checkboxRow}>
            <input type="checkbox" checked={materialsAdditional} onChange={(e) => setMaterialsAdditional(e.target.checked)} className={checkboxInput} />
            Additional materials
          </label>
          <label className={checkboxRow}>
            <input type="checkbox" checked={ceilingPaint} onChange={(e) => setCeilingPaint(e.target.checked)} className={checkboxInput} />
            Ceiling paint
          </label>
          <label className={checkboxRow}>
            <input type="checkbox" checked={otherWork} onChange={(e) => setOtherWork(e.target.checked)} className={checkboxInput} />
            Other work
          </label>
          {otherWork && (
            <input
              type="text"
              value={otherDescription}
              onChange={(e) => setOtherDescription(e.target.value)}
              placeholder="Describe the other work needed"
              className={input}
            />
          )}
        </div>
      </div>

      {error ? <p className="text-xs text-red-500">{error}</p> : null}

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
      >
        {saving ? "Adding…" : "Add unit"}
      </button>
    </form>
  );
}
