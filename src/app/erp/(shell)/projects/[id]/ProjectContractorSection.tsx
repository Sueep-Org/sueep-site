"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export type ContractorRow = {
  id: string;
  contractorId: string;
  contractorName: string;
  role: string | null;
  assignedDate: string | null;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
};

export type ContractorOption = {
  id: string;
  name: string;
  status: string;
};

const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-gray-600";

export function ProjectContractorSection({
  projectId,
  initialAssignments,
  contractors,
}: {
  projectId: string;
  initialAssignments: ContractorRow[];
  contractors: ContractorOption[];
}) {
  const router = useRouter();
  const [assignments, setAssignments] = useState(initialAssignments);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setAssignments(initialAssignments);
  }, [initialAssignments]);

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const contractorId = String(fd.get("contractorId") || "");
    if (!contractorId) {
      setError("Select a contractor.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/erp/projects/${projectId}/contractors`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contractorId,
          role: String(fd.get("role") || "").trim() || undefined,
          assignedDate: String(fd.get("assignedDate") || "") || undefined,
          startDate: String(fd.get("startDate") || "") || undefined,
          endDate: String(fd.get("endDate") || "") || undefined,
          notes: String(fd.get("notes") || "").trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        id?: string;
        contractorId?: string;
        contractor?: { id: string; name: string };
        role?: string | null;
        assignedDate?: string | null;
        startDate?: string | null;
        endDate?: string | null;
        notes?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || "Failed to add contractor");
        setLoading(false);
        return;
      }
      const row: ContractorRow = {
        id: data.id!,
        contractorId: data.contractor?.id ?? data.contractorId ?? contractorId,
        contractorName: data.contractor?.name ?? contractors.find((c) => c.id === contractorId)?.name ?? contractorId,
        role: data.role ?? null,
        assignedDate: data.assignedDate ?? null,
        startDate: data.startDate ?? null,
        endDate: data.endDate ?? null,
        notes: data.notes ?? null,
      };
      setAssignments((prev) => [row, ...prev]);
      e.currentTarget.reset();
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function onRemove(id: string) {
    if (!confirm("Remove this contractor from the project?")) return;
    const res = await fetch(`/api/erp/contractor-assignments/${id}`, { method: "DELETE" });
    if (res.ok) {
      setAssignments((prev) => prev.filter((a) => a.id !== id));
      router.refresh();
    }
  }

  const activeContractors = contractors.filter((c) => c.status !== "INACTIVE");

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Contractors</h2>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 pr-2 font-medium">Contractor</th>
                <th className="py-2 pr-2 font-medium">Role</th>
                <th className="py-2 pr-2 font-medium">Start</th>
                <th className="py-2 pr-2 font-medium">End</th>
                <th className="py-2 font-medium">Notes</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assignments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-gray-500">
                    No contractors assigned to this project yet.
                  </td>
                </tr>
              ) : (
                assignments.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2 pr-2 font-medium text-gray-900">{a.contractorName}</td>
                    <td className="py-2 pr-2 text-gray-500">{a.role || "—"}</td>
                    <td className="py-2 pr-2 text-gray-600">
                      {a.startDate ? new Date(a.startDate).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-2 pr-2 text-gray-600">
                      {a.endDate ? new Date(a.endDate).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-2 text-gray-500">{a.notes || "—"}</td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => onRemove(a.id)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <form onSubmit={onAdd} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Add contractor</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-2">
            <label className={label} htmlFor="c-contractor">
              Contractor *
            </label>
            <select id="c-contractor" name="contractorId" required className={input}>
              <option value="" disabled>
                Select contractor…
              </option>
              {activeContractors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="c-role">
              Role
            </label>
            <input id="c-role" name="role" className={input} placeholder="Painter, cleaner…" />
          </div>
          <div>
            <label className={label} htmlFor="c-assigned">
              Assigned date
            </label>
            <input id="c-assigned" name="assignedDate" type="date" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="c-start">
              Start date
            </label>
            <input id="c-start" name="startDate" type="date" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="c-end">
              End date
            </label>
            <input id="c-end" name="endDate" type="date" className={input} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={label} htmlFor="c-notes">
              Notes
            </label>
            <input id="c-notes" name="notes" className={input} placeholder="Scope, access details…" />
          </div>
        </div>
        {error ? (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="mt-4 rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {loading ? "Adding…" : "Add contractor"}
        </button>
      </form>
    </div>
  );
}
