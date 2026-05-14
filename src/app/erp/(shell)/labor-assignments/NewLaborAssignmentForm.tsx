"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmployeeSelect } from "./EmployeeSelect";
import { TurnoverRequestSelect } from "./TurnoverRequestSelect";

export function NewLaborAssignmentForm() {
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
      const res = await fetch("/api/erp/labor-assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          turnoverRequestId: formData.get("turnoverRequestId"),
          laborerId: formData.get("laborerId"),
          role: formData.get("role") || null,
          assignedDate: formData.get("assignedDate") || null,
          startDate: formData.get("startDate") || null,
          endDate: formData.get("endDate") || null,
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
        router.push(`/erp/labor-assignments/${data.id}`);
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
        {open ? "Close" : "New assignment"}
      </button>

      {open ? (
        <form onSubmit={onSubmit} className="mt-3 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <TurnoverRequestSelect required />
            <EmployeeSelect required />
            <label className="block text-xs font-medium text-gray-600">
              Role
              <input
                name="role"
                placeholder="Foreman, painter, helper"
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
          </div>

          {error ? <p className="text-xs text-red-500">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-500 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Create assignment"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
