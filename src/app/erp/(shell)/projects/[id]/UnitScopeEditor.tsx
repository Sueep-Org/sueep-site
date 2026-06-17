"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TurnoverPricingPackageQuestions } from "@/app/erp/(shell)/turnover-requests/TurnoverPricingPackageQuestions";

type Props = {
  turnoverRequestId: string;
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
  turnoverRequestId,
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
      const res = await fetch(`/api/erp/turnover-requests/${turnoverRequestId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bedrooms: bedroomsStr !== "" ? Number(bedroomsStr) : null,
          bathrooms: bathroomsStr !== "" ? Number(bathroomsStr) : null,
          fullClean: fullCleanVal,
          fullPaint: fullPaintVal,
          touchUpPaint: touchUpPaintStr !== "" ? Number(touchUpPaintStr) : 0,
          carpetCleaning: carpetCleaningVal,
          materialsAdditional: materialsAdditionalVal,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Save failed");
        return;
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
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Unit scope{unitNumber ? ` — Unit ${unitNumber}` : ""}
        </h2>
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
