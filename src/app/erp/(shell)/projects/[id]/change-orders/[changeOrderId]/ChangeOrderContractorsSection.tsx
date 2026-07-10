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
  costCents: number | null;
};

export type ContractorOption = {
  id: string;
  name: string;
  status: string;
};

const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const editInput =
  "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-gray-600";

function fmt(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

type EditFields = {
  contractorId: string;
  role: string;
  startDate: string;
  endDate: string;
  notes: string;
  costDollars: string;
};

export function ChangeOrderContractorsSection({
  projectId,
  changeOrderId,
  initialAssignments,
  contractors,
}: {
  projectId: string;
  changeOrderId: string;
  initialAssignments: ContractorRow[];
  contractors: ContractorOption[];
}) {
  const router = useRouter();
  const [assignments, setAssignments] = useState(initialAssignments);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<EditFields>({ contractorId: "", role: "", startDate: "", endDate: "", notes: "", costDollars: "" });
  const [addError, setAddError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setAssignments(initialAssignments);
  }, [initialAssignments]);

  function startEdit(row: ContractorRow) {
    setEditingId(row.id);
    setEditFields({
      contractorId: row.contractorId,
      role: row.role ?? "",
      startDate: row.startDate ? row.startDate.slice(0, 10) : "",
      endDate: row.endDate ? row.endDate.slice(0, 10) : "",
      notes: row.notes ?? "",
      costDollars: row.costCents != null ? (row.costCents / 100).toFixed(2) : "",
    });
  }

  async function onSaveEdit(rowId: string) {
    const costCents = editFields.costDollars.trim() !== "" ? Math.round(parseFloat(editFields.costDollars) * 100) : null;
    const res = await fetch(`/api/erp/change-order-contractor-assignments/${rowId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contractorId: editFields.contractorId,
        role: editFields.role.trim() || null,
        startDate: editFields.startDate || null,
        endDate: editFields.endDate || null,
        notes: editFields.notes.trim() || null,
        costCents,
      }),
    });
    if (res.ok) {
      const updatedName = contractors.find((c) => c.id === editFields.contractorId)?.name
        ?? assignments.find((a) => a.id === rowId)?.contractorName ?? "";
      setAssignments((prev) =>
        prev.map((a) =>
          a.id === rowId
            ? { ...a, contractorId: editFields.contractorId, contractorName: updatedName, role: editFields.role.trim() || null, startDate: editFields.startDate || null, endDate: editFields.endDate || null, notes: editFields.notes.trim() || null, costCents }
            : a
        )
      );
      setEditingId(null);
      router.refresh();
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Remove this contractor from the change order?")) return;
    const res = await fetch(`/api/erp/change-order-contractor-assignments/${id}`, { method: "DELETE" });
    if (res.ok) {
      setAssignments((prev) => prev.filter((a) => a.id !== id));
      if (editingId === id) setEditingId(null);
      router.refresh();
    }
  }

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAddError("");
    setLoading(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const contractorId = String(fd.get("contractorId") || "");
    if (!contractorId) {
      setAddError("Select a contractor.");
      setLoading(false);
      return;
    }
    const costRaw = String(fd.get("costCents") || "").trim();

    try {
      const res = await fetch(`/api/erp/projects/${projectId}/change-orders/${changeOrderId}/contractors`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contractorId,
          role: String(fd.get("role") || "").trim() || undefined,
          assignedDate: String(fd.get("assignedDate") || "") || undefined,
          startDate: String(fd.get("startDate") || "") || undefined,
          endDate: String(fd.get("endDate") || "") || undefined,
          notes: String(fd.get("notes") || "").trim() || undefined,
          costCents: costRaw !== "" ? Math.round(parseFloat(costRaw) * 100) : undefined,
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
        costCents?: number | null;
        error?: string;
      };
      if (!res.ok) {
        setAddError(data.error || "Failed to add contractor");
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
        costCents: data.costCents ?? null,
      };
      setAssignments((prev) => [row, ...prev]);
      form.reset();
      router.refresh();
    } catch {
      setAddError("Network error");
    } finally {
      setLoading(false);
    }
  }

  const activeContractors = contractors.filter((c) => c.status !== "INACTIVE");

  return (
    <div className="space-y-6">
      {/* Add form — above table */}
      <form onSubmit={onAdd} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Add contractor</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-2">
            <label className={label} htmlFor="co-c-contractor">Contractor *</label>
            <select id="co-c-contractor" name="contractorId" required className={input}>
              <option value="" disabled>Select contractor…</option>
              {activeContractors.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="co-c-role">Role</label>
            <input id="co-c-role" name="role" className={input} placeholder="Painter, cleaner…" />
          </div>
          <div>
            <label className={label} htmlFor="co-c-cost">Cost ($)</label>
            <input id="co-c-cost" name="costCents" type="number" min="0" step="0.01" className={input} placeholder="0.00" />
          </div>
          <div>
            <label className={label} htmlFor="co-c-start">Start date</label>
            <input id="co-c-start" name="startDate" type="date" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="co-c-end">End date</label>
            <input id="co-c-end" name="endDate" type="date" className={input} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={label} htmlFor="co-c-notes">Notes</label>
            <input id="co-c-notes" name="notes" className={input} placeholder="Scope, access details…" />
          </div>
        </div>
        {addError ? <p className="mt-3 text-sm text-red-400" role="alert">{addError}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="mt-4 rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {loading ? "Adding…" : "Add contractor"}
        </button>
      </form>

      {/* Table */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Contractors</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 pr-2 font-medium">Contractor</th>
                <th className="py-2 pr-2 font-medium">Role</th>
                <th className="py-2 pr-2 font-medium">Start</th>
                <th className="py-2 pr-2 font-medium">End</th>
                <th className="py-2 pr-2 font-medium">Cost</th>
                <th className="py-2 pr-2 font-medium">Notes</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assignments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-gray-500">No contractors logged on this change order yet.</td>
                </tr>
              ) : (
                assignments.map((a) =>
                  editingId === a.id ? (
                    <tr key={a.id} className="bg-yellow-50">
                      <td className="py-1 pr-2">
                        <select
                          className={editInput}
                          value={editFields.contractorId}
                          onChange={(e) => setEditFields((f) => ({ ...f, contractorId: e.target.value }))}
                        >
                          {contractors.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1 pr-2">
                        <input type="text" className={editInput} placeholder="—" value={editFields.role} onChange={(e) => setEditFields((f) => ({ ...f, role: e.target.value }))} />
                      </td>
                      <td className="py-1 pr-2">
                        <input type="date" className={editInput} value={editFields.startDate} onChange={(e) => setEditFields((f) => ({ ...f, startDate: e.target.value }))} />
                      </td>
                      <td className="py-1 pr-2">
                        <input type="date" className={editInput} value={editFields.endDate} onChange={(e) => setEditFields((f) => ({ ...f, endDate: e.target.value }))} />
                      </td>
                      <td className="py-1 pr-2">
                        <input type="number" min="0" step="0.01" className={editInput} placeholder="0.00" value={editFields.costDollars} onChange={(e) => setEditFields((f) => ({ ...f, costDollars: e.target.value }))} />
                      </td>
                      <td className="py-1 pr-2">
                        <input type="text" className={editInput} placeholder="—" value={editFields.notes} onChange={(e) => setEditFields((f) => ({ ...f, notes: e.target.value }))} />
                      </td>
                      <td className="py-1 text-right whitespace-nowrap">
                        <button type="button" onClick={() => onSaveEdit(a.id)} className="text-xs font-medium text-pink-600 hover:text-pink-800">Save</button>
                        <button type="button" onClick={() => setEditingId(null)} className="ml-2 text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                        <button type="button" onClick={() => onDelete(a.id)} className="ml-2 text-xs text-red-500 hover:text-red-700">Delete</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={a.id}>
                      <td className="py-2 pr-2 font-medium text-gray-900">{a.contractorName}</td>
                      <td className="py-2 pr-2 text-gray-500">{a.role || "—"}</td>
                      <td className="py-2 pr-2 text-gray-600">{a.startDate ? new Date(a.startDate).toLocaleDateString() : "—"}</td>
                      <td className="py-2 pr-2 text-gray-600">{a.endDate ? new Date(a.endDate).toLocaleDateString() : "—"}</td>
                      <td className="py-2 pr-2 tabular-nums text-gray-700">{a.costCents != null ? fmt(a.costCents) : "—"}</td>
                      <td className="py-2 pr-2 text-gray-500">{a.notes || "—"}</td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <button type="button" onClick={() => startEdit(a)} className="text-xs text-gray-500 hover:text-gray-700">Edit</button>
                        <button type="button" onClick={() => onDelete(a.id)} className="ml-2 text-xs text-red-500 hover:text-red-700">Delete</button>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
