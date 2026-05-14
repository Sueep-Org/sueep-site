"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BuildingSelect } from "@/app/erp/(shell)/buildings/BuildingSelect";

const REQUEST_TYPES = ["TURNOVER", "REGULAR"] as const;
const STATUSES = ["PENDING", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "QUALITY_CHECK", "APPROVED"] as const;

interface RequestEditorProps {
  requestId: string;
  initial: {
    buildingId: string;
    requestType: string;
    unitNumber: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
    fullPaint: boolean;
    touchUpPaint: number;
    fullClean: boolean;
    carpetCleaning: boolean;
    materialsAdditional: boolean;
    startDate: string | null;
    endDate: string | null;
    createdBy: string | null;
    status: string;
  };
}

export function TurnoverRequestProfileEditor({ requestId, initial }: RequestEditorProps) {
  const router = useRouter();
  const [buildingId, setBuildingId] = useState(initial.buildingId);
  const [requestType, setRequestType] = useState(initial.requestType);
  const [unitNumber, setUnitNumber] = useState(initial.unitNumber ?? "");
  const [bedrooms, setBedrooms] = useState(initial.bedrooms?.toString() ?? "");
  const [bathrooms, setBathrooms] = useState(initial.bathrooms?.toString() ?? "");
  const [fullPaint, setFullPaint] = useState(initial.fullPaint);
  const [touchUpPaint, setTouchUpPaint] = useState(initial.touchUpPaint.toString());
  const [fullClean, setFullClean] = useState(initial.fullClean);
  const [carpetCleaning, setCarpetCleaning] = useState(initial.carpetCleaning);
  const [materialsAdditional, setMaterialsAdditional] = useState(initial.materialsAdditional);
  const [startDate, setStartDate] = useState(initial.startDate ?? "");
  const [endDate, setEndDate] = useState(initial.endDate ?? "");
  const [status, setStatus] = useState(initial.status);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const payload = {
      buildingId,
      requestType,
      unitNumber: unitNumber || null,
      bedrooms: bedrooms !== "" ? Number(bedrooms) : null,
      bathrooms: bathrooms !== "" ? Number(bathrooms) : null,
      fullPaint,
      touchUpPaint: touchUpPaint !== "" ? Number(touchUpPaint) : 0,
      fullClean,
      carpetCleaning,
      materialsAdditional,
      startDate: startDate || null,
      endDate: endDate || null,
      status,
    };

    try {
      const res = await fetch(`/api/erp/turnover-requests/${requestId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update request");
        setLoading(false);
        return;
      }
      setSuccess("Saved successfully.");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    if (!window.confirm("Delete this request? This action cannot be undone.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/erp/turnover-requests/${requestId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete request");
        setLoading(false);
        return;
      }
      router.push("/erp/turnover-requests");
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <BuildingSelect value={buildingId} onChange={setBuildingId} required />
        <label className="block text-xs font-medium text-gray-600">
          Request type
          <select
            value={requestType}
            onChange={(e) => setRequestType(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          >
            {REQUEST_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <input
          value={unitNumber}
          onChange={(e) => setUnitNumber(e.target.value)}
          placeholder="Unit number"
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
        />
        <input
          value={bedrooms}
          onChange={(e) => setBedrooms(e.target.value)}
          type="number"
          min="0"
          placeholder="Bedrooms"
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
        />
        <input
          value={bathrooms}
          onChange={(e) => setBathrooms(e.target.value)}
          type="number"
          min="0"
          placeholder="Bathrooms"
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
        />
        <label className="block text-xs font-medium text-gray-600">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          >
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            checked={fullPaint}
            onChange={(e) => setFullPaint(e.target.checked)}
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-pink-600"
          />
          Full paint
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            checked={fullClean}
            onChange={(e) => setFullClean(e.target.checked)}
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-pink-600"
          />
          Full clean
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            checked={carpetCleaning}
            onChange={(e) => setCarpetCleaning(e.target.checked)}
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-pink-600"
          />
          Carpet cleaning
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            checked={materialsAdditional}
            onChange={(e) => setMaterialsAdditional(e.target.checked)}
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-pink-600"
          />
          Additional materials
        </label>
        <input
          value={touchUpPaint}
          onChange={(e) => setTouchUpPaint(e.target.value)}
          type="number"
          min="0"
          placeholder="Touch-up paint qty"
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-gray-600">
          Start date
          <input
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            type="date"
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </label>
        <label className="block text-xs font-medium text-gray-600">
          End date
          <input
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            type="date"
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </label>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
      {success ? <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">{success}</div> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={loading}
          className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Delete request
        </button>
      </div>
    </form>
  );
}
