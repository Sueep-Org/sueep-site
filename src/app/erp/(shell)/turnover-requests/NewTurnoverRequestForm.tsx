"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { BuildingSelect } from "@/app/erp/(shell)/buildings/BuildingSelect";
import { TurnoverPricingPackageQuestions } from "./TurnoverPricingPackageQuestions";

type SelectedBuilding = {
  id: string;
  name: string;
  builder?: string | null;
  address?: string | null;
  pricingPackage?: unknown;
};

type CreatedRequest = {
  id?: string;
  unitNumber?: string;
  requestType?: string;
  startDate?: string;
  endDate?: string;
  fullPaint?: boolean;
  fullClean?: boolean;
  carpetCleaning?: boolean;
  materialsAdditional?: boolean;
  touchUpPaint?: number | string;
  building?: { name?: string };
};

export function NewTurnoverRequestForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdRequest, setCreatedRequest] = useState<CreatedRequest | null>(null);
  const [selectedBuildingName, setSelectedBuildingName] = useState<string | null>(null);
  const [selectedBuildingPricingPackage, setSelectedBuildingPricingPackage] = useState<unknown>(null);
  const [bedrooms, setBedrooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [fullPaint, setFullPaint] = useState(false);
  const [touchUpPaint, setTouchUpPaint] = useState("");
  const [fullClean, setFullClean] = useState(false);
  const [carpetCleaning, setCarpetCleaning] = useState(false);
  const [materialsAdditional, setMaterialsAdditional] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const formData = new FormData(e.currentTarget);

    const currentUser = auth?.currentUser;
    const payload = {
      buildingId: formData.get("buildingId"),
      requestType: formData.get("requestType"),
      unitNumber: formData.get("unitNumber") || undefined,
      bedrooms: bedrooms || undefined,
      bathrooms: bathrooms || undefined,
      fullPaint,
      touchUpPaint: touchUpPaint || undefined,
      fullClean,
      carpetCleaning,
      materialsAdditional,
      startDate: formData.get("startDate") || undefined,
      endDate: formData.get("endDate") || undefined,
      sueepPmName: formData.get("sueepPmName") || undefined,
      sueepPmEmail: formData.get("sueepPmEmail") || undefined,
      createdBy: currentUser?.email || currentUser?.uid || undefined,
    };

    try {
      const res = await fetch("/api/erp/turnover-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}: Failed to create request`);
        setLoading(false);
        return;
      }
      setCreatedRequest(data);
      setOpen(false);
      if (data.id) {
        router.push(`/erp/turnover-requests/${data.id}`);
      } else {
        router.refresh();
      }
    } catch (err: unknown) {
      const message = err instanceof Error 
        ? err.message 
        : 'Failed to reach server';
      setError(`Network error: ${message}`);
      console.error(err);
      setLoading(false);
    }
  }

  // ... rest of the component remains the same
  function generateEmailConfirmation() {
    if (!createdRequest) return;

    const subject = `Turnover Request Confirmation - ${createdRequest.unitNumber || 'Unit'} @ Building`;
    const body = `Hi PM / Sales,

A new turnover request has been captured and logged.

Request ID: ${createdRequest.id}
Building: ${createdRequest.building?.name || 'N/A'}
Unit: ${createdRequest.unitNumber || 'N/A'}
Type: ${createdRequest.requestType}

Dates: ${createdRequest.startDate ? new Date(createdRequest.startDate).toLocaleDateString() : 'TBD'} → ${createdRequest.endDate ? new Date(createdRequest.endDate).toLocaleDateString() : 'TBD'}

Services requested:
${createdRequest.fullPaint ? '- Full Paint\n' : ''}${createdRequest.fullClean ? '- Full Clean\n' : ''}${createdRequest.carpetCleaning ? '- Carpet Cleaning\n' : ''}${createdRequest.materialsAdditional ? '- Additional Materials\n' : ''}${createdRequest.touchUpPaint ? `- Touch-up paint (${createdRequest.touchUpPaint} qty)\n` : ''}

Next steps:
- PM has been notified
- Laborers can now be assigned via the request detail page
- Please confirm dates and scope if anything has changed

Thank you,
Sueep Operations
`;

    const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailto, '_blank');
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          setCreatedRequest(null);
        }}
        className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500"
      >
        {open ? "Close" : "New request"}
      </button>

      {open ? (
        <form onSubmit={onSubmit} className="mt-3 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Sales / PM Input</div>

          <div className="grid gap-3 sm:grid-cols-2">
            <BuildingSelect
              required
              onSelectedBuildingChange={(building) => {
                const selected = building as SelectedBuilding | null;
                setSelectedBuildingName(selected?.name ?? null);
                setSelectedBuildingPricingPackage(selected?.pricingPackage ?? null);
              }}
            />
            <label className="block text-xs font-medium text-gray-600">
              Request type
              <select
                name="requestType"
                defaultValue="TURNOVER"
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              >
                <option value="TURNOVER">Turnover</option>
                <option value="REGULAR">Regular</option>
              </select>
            </label>
            <input
              name="unitNumber"
              placeholder="Unit number"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
          </div>

          <TurnoverPricingPackageQuestions
            buildingName={selectedBuildingName}
            pricingPackage={selectedBuildingPricingPackage}
            bedrooms={bedrooms}
            bathrooms={bathrooms}
            fullPaint={fullPaint}
            touchUpPaint={touchUpPaint}
            fullClean={fullClean}
            carpetCleaning={carpetCleaning}
            materialsAdditional={materialsAdditional}
            setBedrooms={setBedrooms}
            setBathrooms={setBathrooms}
            setFullPaint={setFullPaint}
            setTouchUpPaint={setTouchUpPaint}
            setFullClean={setFullClean}
            setCarpetCleaning={setCarpetCleaning}
            setMaterialsAdditional={setMaterialsAdditional}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-gray-600">
              Start date
              <input name="startDate" type="date" className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900" />
            </label>
            <label className="block text-xs font-medium text-gray-600">
              End date
              <input name="endDate" type="date" className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900" />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              name="sueepPmName"
              placeholder="SUEEP PM name"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
            <input
              name="sueepPmEmail"
              type="email"
              required
              placeholder="SUEEP PM email"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
          </div>

          {error ? <p className="text-xs text-red-500">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-500 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Create request & capture info"}
          </button>

          <p className="text-[10px] text-gray-500">After creation: PM will be notified • Laborers can be assigned on the detail page • Email confirmation available</p>
        </form>
      ) : null}

      {createdRequest && (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
          <div className="font-medium text-green-800">Request captured successfully.</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={generateEmailConfirmation}
              className="rounded-md bg-white px-3 py-1 text-xs font-medium text-green-700 border border-green-300 hover:bg-green-100"
            >
              Generate email confirmation (mailto)
            </button>
            <a
              href={`/erp/turnover-requests/${createdRequest.id}`}
              className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-500"
            >
              Go to request → Assign laborers
            </a>
          </div>
          <p className="mt-2 text-[10px] text-green-700">PM notification triggered via building PM contact. Labor assignment available on detail page.</p>
        </div>
      )}
    </div>
  );
}
