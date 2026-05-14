"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { BuildingSelect } from "@/app/erp/(shell)/buildings/BuildingSelect";

export function NewTurnoverRequestForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdRequest, setCreatedRequest] = useState<any>(null);

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
      bedrooms: formData.get("bedrooms") || undefined,
      bathrooms: formData.get("bathrooms") || undefined,
      fullPaint: formData.get("fullPaint") === "on",
      touchUpPaint: formData.get("touchUpPaint") || undefined,
      fullClean: formData.get("fullClean") === "on",
      carpetCleaning: formData.get("carpetCleaning") === "on",
      materialsAdditional: formData.get("materialsAdditional") === "on",
      startDate: formData.get("startDate") || undefined,
      endDate: formData.get("endDate") || undefined,
      createdBy: currentUser?.email || currentUser?.uid || undefined,
    };

    try {
      const res = await fetch("/api/erp/turnover-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create request");
        setLoading(false);
        return;
      }
      setCreatedRequest(data);
      setOpen(false);
      // Optionally refresh or redirect
      if (data.id) {
        router.push(`/erp/turnover-requests/${data.id}`);
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

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
            <BuildingSelect required />
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
            <input
              name="bedrooms"
              type="number"
              min="0"
              placeholder="Bedrooms"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
            <input
              name="bathrooms"
              type="number"
              min="0"
              placeholder="Bathrooms"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
            <input
              name="touchUpPaint"
              type="number"
              min="0"
              placeholder="Touch-up paint qty"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input name="fullPaint" type="checkbox" className="h-4 w-4 rounded border-gray-300 text-pink-600" />
              Full paint
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input name="fullClean" type="checkbox" className="h-4 w-4 rounded border-gray-300 text-pink-600" />
              Full clean
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input name="carpetCleaning" type="checkbox" className="h-4 w-4 rounded border-gray-300 text-pink-600" />
              Carpet cleaning
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input name="materialsAdditional" type="checkbox" className="h-4 w-4 rounded border-gray-300 text-pink-600" />
              Additional materials
            </label>
          </div>

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
