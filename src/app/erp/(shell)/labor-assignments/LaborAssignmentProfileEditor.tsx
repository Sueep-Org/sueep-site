"use client";

import { useState } from "react";
import { EmployeeSelect } from "./EmployeeSelect";
import { TurnoverRequestSelect } from "./TurnoverRequestSelect";

type Props = {
  assignmentId: string;
  initial: {
    turnoverRequestId: string;
    laborerId: string;
    role: string | null;
    assignedDate: string | null;
    startDate: string | null;
    endDate: string | null;
    materialsUsed?: string[];
    notes?: string | null;
  };
};

export function LaborAssignmentProfileEditor({ assignmentId, initial }: Props) {
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
      const res = await fetch(`/api/erp/labor-assignments/${assignmentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          turnoverRequestId: formData.get("turnoverRequestId"),
          laborerId: formData.get("laborerId"),
          role: formData.get("role") || null,
          assignedDate: formData.get("assignedDate") || null,
          startDate: formData.get("startDate") || null,
          endDate: formData.get("endDate") || null,
          materialsUsed: formData.get("materialsUsed") || null,
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

  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h2 className="text-sm font-semibold text-gray-800">Assignment details</h2>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TurnoverRequestSelect value={initial.turnoverRequestId} required />
          <EmployeeSelect value={initial.laborerId} required />
          <label className="block text-xs font-medium text-gray-600">
            Role
            <input
              name="role"
              defaultValue={initial.role ?? ""}
              placeholder="Foreman, painter, helper"
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
            Materials used
            <input
              name="materialsUsed"
              defaultValue={initial.materialsUsed?.join(", ") ?? ""}
              placeholder="Paint, primer, tarps"
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

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save assignment"}
        </button>
      </form>
    </section>
  );
}
