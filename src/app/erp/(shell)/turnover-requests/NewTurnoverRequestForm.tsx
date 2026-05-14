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
      setOpen(false);
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

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500"
      >
        {open ? "Close" : "New request"}
      </button>

      {open ? (
        <form onSubmit={onSubmit} className="mt-3 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
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
            {loading ? "Saving…" : "Create request"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
