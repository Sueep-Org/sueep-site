"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TurnoverPricingPackageQuestions } from "@/app/erp/(shell)/turnover-requests/TurnoverPricingPackageQuestions";
import { formatUnitDisplay } from "@/lib/erp/unitDisplay";

type Props = {
  projectId: string;
  buildingId: string | null;
  turnoverRequestId: string | null;
  unitNumber: string | null;
  buildingName: string;
  pricingPackage: unknown;
  bedrooms: number | null;
  bathrooms: number | null;
  fullClean: boolean;
  fullPaint: boolean;
  touchUpPaint: number | null;
  carpetCleaning: boolean;
  materialsAdditional: boolean;
};

export function UnitScopeEditor({
  projectId,
  buildingId,
  turnoverRequestId: initialTurnoverRequestId,
  unitNumber,
  buildingName,
  pricingPackage,
  bedrooms,
  bathrooms,
  fullClean,
  fullPaint,
  touchUpPaint,
  carpetCleaning,
  materialsAdditional,
}: Props) {
  const router = useRouter();
  const [turnoverRequestId, setTurnoverRequestId] = useState(initialTurnoverRequestId);
  const [unitNumberVal, setUnitNumberVal] = useState(unitNumber ?? "");
  const [bedroomsStr, setBedroomsStr] = useState(bedrooms?.toString() ?? "");
  const [bathroomsStr, setBathroomsStr] = useState(bathrooms?.toString() ?? "");
  const [fullCleanVal, setFullClean] = useState(fullClean);
  const [fullPaintVal, setFullPaint] = useState(fullPaint);
  const [touchUpPaintStr, setTouchUpPaint] = useState(touchUpPaint?.toString() ?? "0");
  const [carpetCleaningVal, setCarpetCleaning] = useState(carpetCleaning);
  const [materialsAdditionalVal, setMaterialsAdditional] = useState(materialsAdditional);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function onSave() {
    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      const newUnitNumber = unitNumberVal.trim() || null;
      const layoutPayload = {
        unitNumber: newUnitNumber,
        bedrooms: bedroomsStr !== "" ? Number(bedroomsStr) : null,
        bathrooms: bathroomsStr !== "" ? Number(bathroomsStr) : null,
        fullClean: fullCleanVal,
        fullPaint: fullPaintVal,
        touchUpPaint: touchUpPaintStr !== "" ? Number(touchUpPaintStr) : 0,
        carpetCleaning: carpetCleaningVal,
        materialsAdditional: materialsAdditionalVal,
      };
      const newJobTitle = `${buildingName} - ${formatUnitDisplay(newUnitNumber)}`;

      let trId = turnoverRequestId;

      if (!trId) {
        // No TurnoverRequest yet — create one and link it to the project
        if (!buildingId) { setError("No building linked to this project."); return; }
        const createRes = await fetch("/api/erp/turnover-requests", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ buildingId, ...layoutPayload }),
        });
        const created = (await createRes.json()) as { id?: string; error?: string };
        if (!createRes.ok) { setError(created.error ?? "Failed to create layout record"); return; }
        trId = created.id!;
        setTurnoverRequestId(trId);

        // Link the new TurnoverRequest to the project
        const linkRes = await fetch(`/api/erp/projects/${projectId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ turnoverRequestId: trId, jobTitle: newJobTitle }),
        });
        if (!linkRes.ok) { setError("Layout created but failed to link to project"); return; }
      } else {
        const [trRes, projRes] = await Promise.all([
          fetch(`/api/erp/turnover-requests/${trId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(layoutPayload),
          }),
          fetch(`/api/erp/projects/${projectId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jobTitle: newJobTitle }),
          }),
        ]);
        const trData = (await trRes.json().catch(() => ({}))) as { error?: string };
        const projData = (await projRes.json().catch(() => ({}))) as { error?: string };
        if (!trRes.ok) { setError(trData.error ?? "Save failed"); return; }
        if (!projRes.ok) { setError(projData.error ?? "Save failed"); return; }
      }

      setSuccess(true);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-4 space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Unit scope{unitNumberVal ? ` — ${formatUnitDisplay(unitNumberVal)}` : ""}
      </h2>

      <div>
        <label className="block text-xs font-medium text-gray-600" htmlFor="use-unit-number">
          Unit identifier
        </label>
        <input
          id="use-unit-number"
          type="text"
          value={unitNumberVal}
          onChange={(e) => setUnitNumberVal(e.target.value)}
          placeholder="e.g. Unit 1, 2000-2037: C3"
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        />
        <p className="mt-1 text-[11px] text-gray-400">Purely numeric entries (e.g. &ldquo;1&rdquo;) will display as &ldquo;Unit 1&rdquo; automatically.</p>
      </div>

      <TurnoverPricingPackageQuestions
        buildingName={buildingName}
        pricingPackage={pricingPackage}
        bedrooms={bedroomsStr}
        bathrooms={bathroomsStr}
        fullPaint={fullPaintVal}
        touchUpPaint={touchUpPaintStr}
        fullClean={fullCleanVal}
        carpetCleaning={carpetCleaningVal}
        materialsAdditional={materialsAdditionalVal}
        setBedrooms={setBedroomsStr}
        setBathrooms={setBathroomsStr}
        setFullPaint={setFullPaint}
        setTouchUpPaint={setTouchUpPaint}
        setFullClean={setFullClean}
        setCarpetCleaning={setCarpetCleaning}
        setMaterialsAdditional={setMaterialsAdditional}
      />

      {error && <p className="text-xs text-red-500">{error}</p>}
      {success && <p className="text-xs text-emerald-600">Saved — pricing updated.</p>}

      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
