"use client";

import { useState } from "react";
import { ContractorSelect } from "./ContractorSelect";
import { BuildingSelect } from "./BuildingSelect";

type Props = {
  assignmentId: string;
  initial: {
    contractorId: string;
    buildingId: string | null;
    role: string | null;
    assignedDate: string | null;
    startDate: string | null;
    endDate: string | null;
    notes?: string | null;
  };
};

export function ContractorAssignmentProfileEditor({ assignmentId, initial }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setOk("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    try {
      const res = await fetch(`/api/erp/contractor-assignments/${assignmentId}`, {
        method: "PATCH",
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
        setError(data.error || "Update failed");
      } else {
        setOk("Assignment updated.");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    if (!confirm("Delete this contractor assignment?")) return;
    const res = await fetch(`/api/erp/contractor-assignments/${assignmentId}`, { method: "DELETE" });
    if (res.ok) {
      window.location.href = "/erp/contractor-assignments";
    } else {
      setError("Delete failed");
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h2 className="text-sm font-semibold text-gray-800">Assignment details</h2>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <ContractorSelect value={initial.contractorId} required />
          <BuildingSelect value={initial.buildingId ?? ""} />
          <label className="block text-xs font-medium text-gray-600">
            Role
            <input
              name="role"
              defaultValue={initial.role ?? ""}
              placeholder="Painter, cleaner, helper"
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
          </label>
          <label className="block text-xs font-medium text-gray-600">
            Assigned date
            <input
              name="assignedDate"
              type="date"
              defaultValue={initial.assignedDate ?? ""}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
          </label>
          <label className="block text-xs font-medium text-gray-600">
            Start date
            <input
              name="startDate"
              type="date"
              defaultValue={initial.startDate ?? ""}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
          </label>
          <label className="block text-xs font-medium text-gray-600">
            End date
            <input
              name="endDate"
              type="date"
              defaultValue={initial.endDate ?? ""}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
          </label>
          <label className="block text-xs font-medium text-gray-600 sm:col-span-2">
            Notes
            <textarea
              name="notes"
              rows={3}
              defaultValue={initial.notes ?? ""}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
          </label>
        </div>

        {error ? <p className="text-xs text-red-500">{error}</p> : null}
        {ok ? <p className="text-xs text-emerald-600">{ok}</p> : null}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save assignment"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </form>
    </section>
  );
}
