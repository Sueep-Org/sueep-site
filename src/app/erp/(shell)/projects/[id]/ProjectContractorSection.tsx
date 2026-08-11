"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SOVMultiCombobox, type SOVItemOption } from "@/app/erp/components/SOVCombobox";
import { turnoverScopeLabel } from "@/lib/erp/turnoverScope";

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
  taskDescription: string | null;
  sovItemIds: string[];
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
  costDollars: string;
  taskDescription: string;
  sovItemIds: string[];
};

export function ProjectContractorSection({
  projectId,
  initialAssignments,
  contractors,
  sovItems = [],
  isJanitorialUnit = false,
  contractedScopeItems = [],
  completedScopeItems = [],
}: {
  projectId: string;
  initialAssignments: ContractorRow[];
  contractors: ContractorOption[];
  sovItems?: SOVItemOption[];
  /** Whether this project is a janitorial/turnover unit, same flag ProjectLaborSection
   * uses to swap the free-text task field for a scope-item picker. */
  isJanitorialUnit?: boolean;
  /** TURNOVER_SCOPE_OPTIONS values actually contracted for this unit. Empty for
   * non-turnover projects. */
  contractedScopeItems?: string[];
  /** Subset of contractedScopeItems already marked done, same "assume complete
   * until told otherwise" source ProjectLaborSection and UnitScopeChecklist read. */
  completedScopeItems?: string[];
}) {
  const router = useRouter();
  const [assignments, setAssignments] = useState(initialAssignments);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<EditFields>({ contractorId: "", role: "", startDate: "", endDate: "", costDollars: "", taskDescription: "", sovItemIds: [] });
  const [addError, setAddError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [sovPicks, setSovPicks] = useState<string[]>([]);
  const [sovMarkCompleteIds, setSovMarkCompleteIds] = useState<Set<string>>(new Set());
  const [sovCompletedMap, setSovCompletedMap] = useState<Record<string, boolean>>(
    () => Object.fromEntries(sovItems.map((s) => [s.id, s.completed]))
  );
  const [scopeCompletedItems, setScopeCompletedItems] = useState<string[]>(completedScopeItems);
  const [scopeMarkCompleteIds, setScopeMarkCompleteIds] = useState<Set<string>>(new Set());
  const [editScopeMarkComplete, setEditScopeMarkComplete] = useState(false);
  const [unitCompleted, setUnitCompleted] = useState(false);
  const availableScopeItems = contractedScopeItems.filter((v) => !scopeCompletedItems.includes(v));
  const [notesMap, setNotesMap] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialAssignments.map((a) => [a.id, a.notes ?? ""]))
  );
  const [notesPopup, setNotesPopup] = useState<{ id: string; draft: string } | null>(null);

  useEffect(() => {
    setAssignments(initialAssignments);
    setNotesMap(Object.fromEntries(initialAssignments.map((a) => [a.id, a.notes ?? ""])));
  }, [initialAssignments]);

  useEffect(() => {
    setScopeCompletedItems(completedScopeItems);
  }, [completedScopeItems]);

  async function markScopeItemsComplete(values: string[]) {
    if (values.length === 0) return;
    const next = [...new Set([...scopeCompletedItems, ...values])];
    setScopeCompletedItems(next);
    try {
      await fetch(`/api/erp/projects/${projectId}/scope-items`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ completedScopeItems: next }),
      });
    } catch {
      setScopeCompletedItems(scopeCompletedItems);
    }
  }

  // Raw TURNOVER_SCOPE_OPTIONS value behind the edit row's Task select (which
  // stores/displays the human label), so the "mark complete" checkbox and save
  // handler can work with the same value markScopeItemsComplete expects.
  const editScopeRawValue = contractedScopeItems.find((v) => turnoverScopeLabel(v) === editFields.taskDescription);

  function handleNotesSave() {
    if (!notesPopup) return;
    const { id, draft } = notesPopup;
    setNotesMap((prev) => ({ ...prev, [id]: draft }));
    setNotesPopup(null);
    fetch(`/api/erp/contractor-assignments/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: draft || null }),
    }).catch(() => {});
  }

  async function toggleSOVComplete(sovItemId: string) {
    const next = !sovCompletedMap[sovItemId];
    setSovCompletedMap((prev) => ({ ...prev, [sovItemId]: next }));
    try {
      await fetch(`/api/erp/projects/${projectId}/sov/items/${sovItemId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ completed: next }),
      });
    } catch {
      setSovCompletedMap((prev) => ({ ...prev, [sovItemId]: !next }));
    }
  }

  function startEdit(row: ContractorRow) {
    setEditingId(row.id);
    setEditFields({
      contractorId: row.contractorId,
      role: row.role ?? "",
      startDate: row.startDate ? row.startDate.slice(0, 10) : "",
      endDate: row.endDate ? row.endDate.slice(0, 10) : "",
      costDollars: row.costCents != null ? (row.costCents / 100).toFixed(2) : "",
      taskDescription: row.taskDescription ?? "",
      sovItemIds: row.sovItemIds,
    });
    setEditScopeMarkComplete(false);
  }

  async function onSaveEdit(rowId: string) {
    const costCents = editFields.costDollars.trim() !== "" ? Math.round(parseFloat(editFields.costDollars) * 100) : null;
    const taskDescription = editFields.taskDescription.trim() || null;
    const res = await fetch(`/api/erp/contractor-assignments/${rowId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contractorId: editFields.contractorId,
        role: editFields.role.trim() || null,
        startDate: editFields.startDate || null,
        endDate: editFields.endDate || null,
        costCents,
        taskDescription,
        sovItemIds: editFields.sovItemIds,
      }),
    });
    if (res.ok) {
      const updatedName = contractors.find((c) => c.id === editFields.contractorId)?.name
        ?? assignments.find((a) => a.id === rowId)?.contractorName ?? "";
      setAssignments((prev) =>
        prev.map((a) =>
          a.id === rowId
            ? { ...a, contractorId: editFields.contractorId, contractorName: updatedName, role: editFields.role.trim() || null, startDate: editFields.startDate || null, endDate: editFields.endDate || null, costCents, taskDescription, sovItemIds: editFields.sovItemIds }
            : a
        )
      );
      if (editScopeMarkComplete && editScopeRawValue) void markScopeItemsComplete([editScopeRawValue]);
      setEditScopeMarkComplete(false);
      setEditingId(null);
      router.refresh();
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Remove this contractor from the project?")) return;
    const res = await fetch(`/api/erp/contractor-assignments/${id}`, { method: "DELETE" });
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
    const taskDescription = String(fd.get("taskDescription") || "").trim();
    const sovCompletedIds = sovPicks.filter((id) => sovMarkCompleteIds.has(id));
    // Same idea as ProjectLaborSection's workDate: the day the work actually
    // wrapped, not today, so the completion-digest email groups it correctly.
    const completionDate = String(fd.get("endDate") || "") || String(fd.get("startDate") || "");

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
          costCents: costRaw !== "" ? Math.round(parseFloat(costRaw) * 100) : undefined,
          taskDescription: taskDescription || undefined,
          sovItemIds: sovPicks.length > 0 ? sovPicks : undefined,
          sovCompletedIds: sovCompletedIds.length > 0 ? sovCompletedIds : undefined,
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
        taskDescription?: string | null;
        sovItems?: { id: string }[];
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
        taskDescription: data.taskDescription ?? null,
        sovItemIds: (data.sovItems ?? []).map((s) => s.id),
      };
      if (sovCompletedIds.length > 0) {
        setSovCompletedMap((prev) => {
          const next = { ...prev };
          for (const id of sovCompletedIds) next[id] = true;
          return next;
        });
      }
      if (scopeMarkCompleteIds.size > 0) void markScopeItemsComplete(Array.from(scopeMarkCompleteIds));
      let unitCompleteError = "";
      if (unitCompleted) {
        if (!completionDate) {
          unitCompleteError = "An end date (or start date) is required to mark the unit complete.";
        } else {
          try {
            const completeRes = await fetch(`/api/erp/projects/${projectId}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ status: "COMPLETE", projectEndDate: completionDate }),
            });
            if (!completeRes.ok) {
              const completeData = (await completeRes.json().catch(() => ({}))) as { error?: string };
              unitCompleteError = completeData.error || "Failed to mark unit as completed.";
            }
          } catch {
            unitCompleteError = "Network error marking unit as completed.";
          }
        }
      }
      setAssignments((prev) => [row, ...prev]);
      form.reset();
      setSovPicks([]);
      setSovMarkCompleteIds(new Set());
      setScopeMarkCompleteIds(new Set());
      setUnitCompleted(false);
      if (unitCompleteError) setAddError(unitCompleteError);
      router.refresh();
    } catch {
      setAddError("Network error");
    } finally {
      setLoading(false);
    }
  }

  const activeContractors = contractors.filter((c) => c.status !== "INACTIVE");

  return (
    <>
    <div className="space-y-6">
      {/* Add form — above table */}
      {showAddForm && <form onSubmit={onAdd} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Add contractor</h2>
          <button
            type="button"
            onClick={() => setShowAddForm(false)}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Close
          </button>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-2">
            <label className={label} htmlFor="c-contractor">Contractor *</label>
            <select id="c-contractor" name="contractorId" required className={input}>
              <option value="" disabled>Select contractor…</option>
              {activeContractors.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="c-role">Role</label>
            <input id="c-role" name="role" className={input} placeholder="Painter, cleaner…" />
          </div>
          <div>
            <label className={label} htmlFor="c-cost">Cost ($)</label>
            <input id="c-cost" name="costCents" type="number" min="0" step="0.01" className={input} placeholder="0.00" />
          </div>
          <div>
            <label className={label} htmlFor="c-start">Start date</label>
            <input id="c-start" name="startDate" type="date" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="c-end">End date</label>
            <input id="c-end" name="endDate" type="date" className={input} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            {sovItems.length > 0 && (
              <div>
                <label className={label}>SOV Items / Tasks</label>
                <div className="space-y-2">
                  <SOVMultiCombobox sovItems={sovItems} selectedIds={sovPicks} onChange={(ids) => {
                    setSovPicks(ids);
                    setSovMarkCompleteIds((prev) => {
                      const next = new Set<string>();
                      for (const id of ids) if (prev.has(id)) next.add(id);
                      return next;
                    });
                  }} />
                  {sovPicks.length > 0 && (
                    <div className="space-y-1 rounded-md border border-gray-200 bg-white px-3 py-2">
                      {sovPicks.map((id) => {
                        const item = sovItems.find((s) => s.id === id);
                        if (!item) return null;
                        return (
                          <label key={id} className="flex cursor-pointer items-center gap-2 text-xs text-gray-600">
                            <input
                              type="checkbox"
                              checked={sovMarkCompleteIds.has(id)}
                              onChange={(e) => setSovMarkCompleteIds((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(id); else next.delete(id);
                                return next;
                              })}
                              className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                            />
                            Mark &quot;{item.description}&quot; complete
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className={sovItems.length > 0 ? "mt-3" : ""}>
              <label className={label} htmlFor="c-task">
                {sovItems.length > 0 ? "Additional task notes (optional)" : "Task"}
              </label>
              {sovItems.length === 0 && isJanitorialUnit && contractedScopeItems.length > 0 ? (
                <select id="c-task" name="taskDescription" className={input} defaultValue="">
                  <option value="" disabled>
                    Select scope item
                  </option>
                  {contractedScopeItems.map((value) => (
                    <option key={value} value={turnoverScopeLabel(value)}>
                      {turnoverScopeLabel(value)}
                    </option>
                  ))}
                </select>
              ) : (
                <input id="c-task" name="taskDescription" className={input} placeholder="Paint touch-up, unit 590…" />
              )}
            </div>
            {isJanitorialUnit && availableScopeItems.length > 0 && (
              <div className="mt-3">
                <label className={label}>Mark scope complete</label>
                <div className="space-y-1 rounded-md border border-gray-200 bg-white px-3 py-2">
                  {availableScopeItems.map((value) => (
                    <label key={value} className="flex cursor-pointer items-center gap-2 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={scopeMarkCompleteIds.has(value)}
                        onChange={(e) => setScopeMarkCompleteIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(value); else next.delete(value);
                          return next;
                        })}
                        className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                      />
                      This contractor finishes &quot;{turnoverScopeLabel(value)}&quot;
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        {isJanitorialUnit && (
          <div className="mt-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={unitCompleted}
                onChange={(e) => setUnitCompleted(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
              />
              Mark unit as completed
            </label>
            <p className="mt-1 text-[11px] text-gray-400">Requires the quality checklist to be fully checked off (a PM can override).</p>
          </div>
        )}
        {addError ? <p className="mt-3 text-sm text-red-400" role="alert">{addError}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="mt-4 rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {loading ? "Adding…" : "Add contractor"}
        </button>
      </form>}

      {/* Table */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Contractors</h2>
          {!showAddForm && (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              aria-label="Add contractor"
              title="Add contractor"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pink-600 text-lg font-semibold leading-none text-white shadow hover:bg-pink-500"
            >
              +
            </button>
          )}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 pr-2 font-medium">Contractor</th>
                <th className="py-2 pr-2 font-medium">Role</th>
                <th className="py-2 pr-2 font-medium">Start</th>
                <th className="py-2 pr-2 font-medium">End</th>
                <th className="py-2 pr-2 font-medium">Cost</th>
                <th className="py-2 pr-2 font-medium">Task</th>
                <th className="py-2 pr-2 font-medium">Notes</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assignments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-gray-500">No contractors assigned to this project yet.</td>
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
                        {sovItems.length > 0 ? (
                          <div className="space-y-1">
                            <SOVMultiCombobox
                              sovItems={sovItems}
                              selectedIds={editFields.sovItemIds}
                              onChange={(ids) => setEditFields((f) => ({ ...f, sovItemIds: ids }))}
                            />
                            <input
                              type="text"
                              className={editInput}
                              placeholder="Additional task notes…"
                              value={editFields.taskDescription}
                              onChange={(e) => setEditFields((f) => ({ ...f, taskDescription: e.target.value }))}
                            />
                          </div>
                        ) : isJanitorialUnit && contractedScopeItems.length > 0 ? (
                          <div className="space-y-1">
                            <select
                              className={editInput}
                              value={editFields.taskDescription}
                              onChange={(e) => {
                                setEditFields((f) => ({ ...f, taskDescription: e.target.value }));
                                setEditScopeMarkComplete(false);
                              }}
                            >
                              <option value="">Select scope item</option>
                              {contractedScopeItems.map((value) => (
                                <option key={value} value={turnoverScopeLabel(value)}>
                                  {turnoverScopeLabel(value)}
                                </option>
                              ))}
                            </select>
                            {editScopeRawValue && !scopeCompletedItems.includes(editScopeRawValue) && (
                              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-gray-500">
                                <input
                                  type="checkbox"
                                  checked={editScopeMarkComplete}
                                  onChange={(e) => setEditScopeMarkComplete(e.target.checked)}
                                  className="h-3.5 w-3.5 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                                />
                                Mark complete
                              </label>
                            )}
                          </div>
                        ) : (
                          <input type="text" className={editInput} placeholder="—" value={editFields.taskDescription} onChange={(e) => setEditFields((f) => ({ ...f, taskDescription: e.target.value }))} />
                        )}
                      </td>
                      <td className="py-1 pr-2">
                        <button
                          type="button"
                          onClick={() => setNotesPopup({ id: a.id, draft: notesMap[a.id] ?? "" })}
                          title={notesMap[a.id] || "Add notes"}
                          className={`rounded p-1 transition-colors ${notesMap[a.id] ? "text-pink-500 hover:text-pink-700" : "text-gray-300 hover:text-gray-500"}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                            <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.683 1.82a.75.75 0 0 0 .953.953l1.82-.683a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474ZM3.5 6.75c0-.966.784-1.75 1.75-1.75h1a.75.75 0 0 1 0 1.5h-1a.25.25 0 0 0-.25.25v5c0 .138.112.25.25.25h5a.25.25 0 0 0 .25-.25v-1a.75.75 0 0 1 1.5 0v1A1.75 1.75 0 0 1 10.25 13.5h-5A1.75 1.75 0 0 1 3.5 11.75v-5Z" />
                          </svg>
                        </button>
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
                      <td className="py-2 pr-2">
                        {a.sovItemIds.length > 0 ? (
                          <div className="space-y-1">
                            {a.sovItemIds.map((sovItemId) => (
                              <div key={sovItemId} className="flex items-center gap-1.5">
                                <input
                                  type="checkbox"
                                  checked={!!sovCompletedMap[sovItemId]}
                                  onChange={() => toggleSOVComplete(sovItemId)}
                                  title="Mark SOV item complete"
                                  className="h-4 w-4 shrink-0 rounded border-gray-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
                                />
                                <span className={`text-xs ${sovCompletedMap[sovItemId] ? "line-through text-gray-400" : "text-gray-700"}`}>
                                  {sovItems.find((s) => s.id === sovItemId)?.description ?? "—"}
                                </span>
                              </div>
                            ))}
                            {a.taskDescription ? <span className="block text-xs text-gray-500">{a.taskDescription}</span> : null}
                          </div>
                        ) : (
                          <span className="text-gray-500">{a.taskDescription || "—"}</span>
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        <button
                          type="button"
                          onClick={() => setNotesPopup({ id: a.id, draft: notesMap[a.id] ?? "" })}
                          title={notesMap[a.id] || "Add notes"}
                          className={`rounded p-0.5 transition-colors ${notesMap[a.id] ? "text-pink-500 hover:text-pink-700" : "text-gray-300 hover:text-gray-500"}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                            <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.683 1.82a.75.75 0 0 0 .953.953l1.82-.683a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474ZM3.5 6.75c0-.966.784-1.75 1.75-1.75h1a.75.75 0 0 1 0 1.5h-1a.25.25 0 0 0-.25.25v5c0 .138.112.25.25.25h5a.25.25 0 0 0 .25-.25v-1a.75.75 0 0 1 1.5 0v1A1.75 1.75 0 0 1 10.25 13.5h-5A1.75 1.75 0 0 1 3.5 11.75v-5Z" />
                          </svg>
                        </button>
                      </td>
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

    {notesPopup ? (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={() => setNotesPopup(null)}
      >
        <div
          className="w-80 rounded-xl bg-white p-5 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="mb-3 text-sm font-semibold text-gray-800">Notes</h3>
          <textarea
            autoFocus
            rows={4}
            value={notesPopup.draft}
            onChange={(e) => setNotesPopup((p) => p ? { ...p, draft: e.target.value } : null)}
            placeholder="Add notes..."
            className="w-full resize-none rounded-lg border border-gray-200 p-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-400"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setNotesPopup(null)}
              className="rounded-lg px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleNotesSave}
              className="rounded-lg bg-[#E73C6E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-pink-700"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
