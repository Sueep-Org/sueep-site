"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ContractorSelect } from "./ContractorSelect";
import { BuildingSelect } from "./BuildingSelect";

export function NewContractorAssignmentForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const formData = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/erp/contractor-assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contractorId: formData.get("contractorId"),
          buildingId: formData.get("buildingId") || null,
          role: formData.get("role") || null,
          assignedDate: formData.get("assignedDate") || null,
          startDate: formData.get("startDate") || null,
          endDate: formData.get("endDate") || null,
          notes: formData.get("notes") || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create assignment");
        setLoading(false);
        return;
      }

      setOpen(false);
      if (data.id) {
        router.push(`/erp/contractor-assignments/${data.id}`);
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
        onClick={() => setOpen((v) => !v)}
        className="rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
      >
        {open ? "Close" : "New assignment"}
      </button>

      {open ? (
        <form onSubmit={onSubmit} className="mt-3 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <ContractorSelect required />
            <BuildingSelect />
            <label className="block text-xs font-medium text-gray-600">
              Role
              <input
                name="role"
                placeholder="Painter, cleaner, helper"
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              />
            </label>
            <label className="block text-xs font-medium text-gray-600">
              Assigned date
              <input
                name="assignedDate"
                type="date"
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              />
            </label>
            <label className="block text-xs font-medium text-gray-600">
              Start date
              <input
                name="startDate"
                type="date"
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              />
            </label>
            <label className="block text-xs font-medium text-gray-600">
              End date
              <input
                name="endDate"
                type="date"
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              />
            </label>
            <label className="block text-xs font-medium text-gray-600 sm:col-span-2">
              Notes
              <textarea
                name="notes"
                rows={3}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              />
            </label>
          </div>

          {error ? <p className="text-xs text-red-500">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Create assignment"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
