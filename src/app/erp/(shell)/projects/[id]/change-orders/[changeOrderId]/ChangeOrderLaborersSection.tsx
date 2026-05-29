"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { centsToDollars } from "@/lib/erp/money";

export type ChangeOrderLaborerRow = {
  id: string;
  employeeId: string | null;
  name: string;
  role: string | null;
  workDate: string;
  hours: number;
  hourlyRateCents: number;
  taskDescription: string | null;
  qualityRating: string | null;
  qualityNotes: string | null;
};

const QUALITY_OPTIONS = [
  { value: "", label: "—" },
  { value: "EXCELLENT", label: "Excellent" },
  { value: "GOOD", label: "Good" },
  { value: "FAIR", label: "Fair" },
  { value: "POOR", label: "Poor" },
];

const QUALITY_COLORS: Record<string, string> = {
  EXCELLENT: "text-emerald-600",
  GOOD: "text-blue-600",
  FAIR: "text-amber-600",
  POOR: "text-red-600",
};

export type ChangeOrderLaborerEmployeeOption = {
  id: string;
  firstName: string;
  lastName: string;
  hourlyPayCents: number | null;
  role: string | null;
  status: string;
};

const OTHER_VALUE = "__other__";

const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const editInput =
  "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-gray-600";

function lineCostCents(hours: number, rateCents: number): number {
  if (!Number.isFinite(hours)) return 0;
  return Math.round(hours * rateCents);
}

function employeeLabel(e: ChangeOrderLaborerEmployeeOption): string {
  const name = `${e.firstName} ${e.lastName}`.trim();
  return e.status === "INACTIVE" ? `${name} (inactive)` : name;
}

function EmployeeCombobox({
  employees,
  value,
  onChange,
}: {
  employees: ChangeOrderLaborerEmployeeOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = value === OTHER_VALUE ? null : employees.find((e) => e.id === value);
  const displayName = value === OTHER_VALUE ? "Other (not in roster)" : selected ? employeeLabel(selected) : "";

  const filtered = query.trim()
    ? employees.filter((e) => employeeLabel(e).toLowerCase().includes(query.toLowerCase()))
    : employees;

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (!value) setQuery("");
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [value]);

  function handleSelect(id: string) {
    onChange(id);
    setQuery(id === OTHER_VALUE ? "Other (not in roster)" : employeeLabel(employees.find((e) => e.id === id)!));
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        autoComplete="off"
        className={input}
        placeholder={displayName || "Type to search…"}
        value={open ? query : displayName}
        onFocus={() => { setQuery(""); setOpen(true); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); if (value) onChange(""); }}
        onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); setQuery(displayName); } }}
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg text-sm">
          {filtered.map((emp) => (
            <li
              key={emp.id}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(emp.id); }}
              className="cursor-pointer px-3 py-2 text-gray-900 hover:bg-pink-50 hover:text-pink-700"
            >
              {employeeLabel(emp)}
            </li>
          ))}
          <li
            onMouseDown={(e) => { e.preventDefault(); handleSelect(OTHER_VALUE); }}
            className="cursor-pointer border-t border-gray-100 px-3 py-2 text-gray-500 hover:bg-pink-50 hover:text-pink-700"
          >
            Other (not in roster — type name)
          </li>
        </ul>
      )}
    </div>
  );
}

export function ChangeOrderLaborersSection({
  projectId,
  changeOrderId,
  initialLaborers,
  employees,
}: {
  projectId: string;
  changeOrderId: string;
  initialLaborers: ChangeOrderLaborerRow[];
  employees: ChangeOrderLaborerEmployeeOption[];
}) {
  const router = useRouter();
  const [laborers, setLaborers] = useState(initialLaborers);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [employeePick, setEmployeePick] = useState<string>("");
  const [hourlyRateStr, setHourlyRateStr] = useState("");
  const [roleStr, setRoleStr] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState({ workDate: "", name: "", role: "", hours: "", hourlyRate: "", taskDescription: "" });
  const [qualityMap, setQualityMap] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialLaborers.map((l) => [l.id, l.qualityRating ?? ""]))
  );
  const [notesMap, setNotesMap] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialLaborers.map((l) => [l.id, l.qualityNotes ?? ""]))
  );
  const [qualityPopup, setQualityPopup] = useState<{ id: string; draft: string } | null>(null);

  useEffect(() => {
    setLaborers(initialLaborers);
    setQualityMap(Object.fromEntries(initialLaborers.map((l) => [l.id, l.qualityRating ?? ""])));
    setNotesMap(Object.fromEntries(initialLaborers.map((l) => [l.id, l.qualityNotes ?? ""])));
  }, [initialLaborers]);

  useEffect(() => {
    if (!employeePick || employeePick === OTHER_VALUE) {
      setHourlyRateStr("");
      setRoleStr("");
      return;
    }
    const e = employees.find((x) => x.id === employeePick);
    setHourlyRateStr(e?.hourlyPayCents != null ? (e.hourlyPayCents / 100).toFixed(2) : "");
    setRoleStr(e?.role ?? "");
  }, [employeePick, employees]);

  function handleQualityChange(laborerId: string, value: string) {
    setQualityMap((prev) => ({ ...prev, [laborerId]: value }));
    fetch(`/api/erp/change-order-laborers/${laborerId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ qualityRating: value || null }),
    }).catch(() => {});
  }

  function handleQualityNotesSave() {
    if (!qualityPopup) return;
    const { id, draft } = qualityPopup;
    setNotesMap((prev) => ({ ...prev, [id]: draft }));
    setQualityPopup(null);
    fetch(`/api/erp/change-order-laborers/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ qualityNotes: draft || null }),
    }).catch(() => {});
  }

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!employeePick) {
      setError('Choose an employee from the list, or "Other" if they are not in the roster.');
      return;
    }
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const workDate = String(fd.get("workDate") || "");
    const hours = Number(fd.get("hours"));
    const hourlyRate = hourlyRateStr.replace(/[$,]/g, "") || String(fd.get("hourlyRate") || "").replace(/[$,]/g, "");
    const taskDescription = String(fd.get("taskDescription") || "").trim();
    const workerName = employeePick === OTHER_VALUE ? String(fd.get("workerName") || "").trim() : undefined;

    if (employeePick === OTHER_VALUE && !workerName) {
      setError("Worker name is required.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/erp/projects/${projectId}/change-orders/${changeOrderId}/laborers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employeeId: employeePick !== OTHER_VALUE ? employeePick : OTHER_VALUE,
          workerName,
          workDate,
          role: roleStr.trim() || undefined,
          hours,
          hourlyRate: Number(hourlyRate),
          taskDescription: taskDescription || undefined,
        }),
      });
      const data = (await res.json()) as Partial<ChangeOrderLaborerRow> & { error?: string };
      if (!res.ok) { setError(data.error || "Failed to add entry"); setLoading(false); return; }
      const picked = employees.find((x) => x.id === employeePick);
      const row: ChangeOrderLaborerRow = {
        id: data.id!,
        employeeId: data.employeeId ?? null,
        name: data.name ?? (picked ? `${picked.firstName} ${picked.lastName}`.trim() : workerName ?? employeePick),
        role: data.role ?? null,
        workDate: data.workDate ?? workDate,
        hours: data.hours ?? hours,
        hourlyRateCents: data.hourlyRateCents ?? Math.round(Number(hourlyRate) * 100),
        taskDescription: data.taskDescription ?? null,
        qualityRating: null,
        qualityNotes: null,
      };
      setLaborers((prev) => [row, ...prev]);
      e.currentTarget.reset();
      setEmployeePick("");
      setHourlyRateStr("");
      setRoleStr("");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function startEdit(l: ChangeOrderLaborerRow) {
    setEditingId(l.id);
    setEditFields({
      workDate: new Date(l.workDate).toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
      name: l.name,
      role: l.role ?? "",
      hours: String(l.hours),
      hourlyRate: (l.hourlyRateCents / 100).toFixed(2),
      taskDescription: l.taskDescription ?? "",
    });
  }

  async function onSaveEdit(entryId: string) {
    const res = await fetch(`/api/erp/change-order-laborers/${entryId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workDate: editFields.workDate,
        name: editFields.name,
        role: editFields.role || null,
        hours: Number(editFields.hours),
        hourlyRate: editFields.hourlyRate,
        taskDescription: editFields.taskDescription || null,
      }),
    });
    if (res.ok) {
      const updated = (await res.json()) as Partial<ChangeOrderLaborerRow>;
      setLaborers((prev) =>
        prev.map((l) =>
          l.id === entryId
            ? { ...l, workDate: updated.workDate ?? l.workDate, name: updated.name ?? l.name, role: updated.role ?? null, hours: updated.hours ?? l.hours, hourlyRateCents: updated.hourlyRateCents ?? l.hourlyRateCents, taskDescription: updated.taskDescription ?? null }
            : l,
        ),
      );
      setEditingId(null);
      router.refresh();
    }
  }

  async function onRemove(id: string) {
    if (!confirm("Remove this labor entry?")) return;
    const res = await fetch(`/api/erp/change-order-laborers/${id}`, { method: "DELETE" });
    if (res.ok) {
      setLaborers((prev) => prev.filter((l) => l.id !== id));
      router.refresh();
    }
  }

  const [filterDate, setFilterDate] = useState("");
  const [filterLaborer, setFilterLaborer] = useState("");
  const [sortField, setSortField] = useState<"date" | "name" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(field: "date" | "name") {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const totalCents = laborers.reduce((s, l) => s + lineCostCents(l.hours, l.hourlyRateCents), 0);

  let visibleLaborers = laborers.filter((l) => {
    if (filterDate) {
      const rowDate = new Date(l.workDate).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      if (rowDate !== filterDate) return false;
    }
    if (filterLaborer && !l.name.toLowerCase().includes(filterLaborer.toLowerCase())) return false;
    return true;
  });

  if (sortField === "date") {
    visibleLaborers = [...visibleLaborers].sort((a, b) =>
      sortDir === "asc" ? a.workDate.localeCompare(b.workDate) : b.workDate.localeCompare(a.workDate)
    );
  } else if (sortField === "name") {
    visibleLaborers = [...visibleLaborers].sort((a, b) =>
      sortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
    );
  }

  const filteredTotalCents = visibleLaborers.reduce((s, l) => s + lineCostCents(l.hours, l.hourlyRateCents), 0);

  return (
    <>
    <div className="space-y-6">
      <form onSubmit={onAdd} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Add labor entry</h2>
        <p className="mt-2 text-xs text-gray-500">
          Pick the employee from your roster so hours link to the right person and bill rates stay consistent. Use
          &ldquo;Other&rdquo; only when the worker is not in the list.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={label} htmlFor="col-workDate">Work date *</label>
            <input id="col-workDate" name="workDate" type="date" required className={input} />
          </div>
          <div className="sm:col-span-2 lg:col-span-2">
            <label className={label} htmlFor="col-employee">Employee *</label>
            <EmployeeCombobox employees={employees} value={employeePick} onChange={setEmployeePick} />
          </div>
          {employeePick === OTHER_VALUE ? (
            <div className="sm:col-span-2 lg:col-span-3">
              <label className={label} htmlFor="col-worker">Worker name *</label>
              <input id="col-worker" name="workerName" required className={input} placeholder="As it should appear on the log" />
            </div>
          ) : null}
          <div>
            <label className={label} htmlFor="col-role">Role</label>
            <input id="col-role" name="role" className={input} placeholder="PM, Cleaner…" value={roleStr} onChange={(e) => setRoleStr(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="col-hours">Hours *</label>
            <input id="col-hours" name="hours" type="number" min={0.25} step={0.25} required className={input} />
          </div>
          <div>
            <label className={label} htmlFor="col-rate">Hourly rate (USD) *</label>
            <input id="col-rate" name="hourlyRate" type="text" required className={input} placeholder="28.84" value={hourlyRateStr} onChange={(ev) => setHourlyRateStr(ev.target.value)} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={label} htmlFor="col-task">Task</label>
            <input id="col-task" name="taskDescription" className={input} placeholder="Rough clean unit 590…" />
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-red-400" role="alert">{error}</p> : null}
        <button type="submit" disabled={loading} className="mt-4 rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50">
          {loading ? "Adding…" : "Add entry"}
        </button>
      </form>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Labor log</h2>
          <p className="text-sm text-gray-700">
            {filterDate || filterLaborer ? (
              <>
                Showing: <span className="font-semibold text-gray-900">{centsToDollars(filteredTotalCents)}</span>
                <span className="ml-1 text-xs text-gray-400">(total: {centsToDollars(totalCents)})</span>
              </>
            ) : (
              <>Sum of lines: <span className="font-semibold text-gray-900">{centsToDollars(totalCents)}</span></>
            )}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap gap-3">
          <div className="flex-1 min-w-[140px]">
            <label className={label} htmlFor="co-filter-date">Filter by date</label>
            <input
              id="co-filter-date"
              type="date"
              className={input}
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className={label} htmlFor="co-filter-laborer">Filter by laborer</label>
            <input
              id="co-filter-laborer"
              type="text"
              className={input}
              placeholder="Name…"
              value={filterLaborer}
              onChange={(e) => setFilterLaborer(e.target.value)}
            />
          </div>
          {(filterDate || filterLaborer) && (
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => { setFilterDate(""); setFilterLaborer(""); }}
                className="mb-0.5 rounded-md border border-gray-200 px-3 py-2 text-xs text-gray-500 hover:bg-gray-100"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 pr-2 font-medium">
                  <button type="button" onClick={() => handleSort("date")} className="flex items-center gap-1 hover:text-gray-800">
                    Date {sortField === "date" ? (sortDir === "asc" ? "▲" : "▼") : <span className="text-gray-300">⇅</span>}
                  </button>
                </th>
                <th className="py-2 pr-2 font-medium">
                  <button type="button" onClick={() => handleSort("name")} className="flex items-center gap-1 hover:text-gray-800">
                    Worker {sortField === "name" ? (sortDir === "asc" ? "▲" : "▼") : <span className="text-gray-300">⇅</span>}
                  </button>
                </th>
                <th className="py-2 pr-2 font-medium">Role</th>
                <th className="py-2 pr-2 font-medium">Hours</th>
                <th className="py-2 pr-2 font-medium">Rate</th>
                <th className="py-2 pr-2 font-medium">Line $</th>
                <th className="py-2 pr-2 font-medium">Task</th>
                <th className="py-2 pr-2 font-medium">Quality</th>
                <th className="py-2 pr-2 font-medium">Notes</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleLaborers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-6 text-center text-gray-500">
                    {filterDate || filterLaborer ? "No entries match the filters." : "No labor entries yet."}
                  </td>
                </tr>
              ) : (
                visibleLaborers.map((l) => {
                  const quality = qualityMap[l.id] ?? "";
                  const notes = notesMap[l.id] ?? "";
                  return editingId === l.id ? (
                    <tr key={l.id} className="bg-yellow-50">
                      <td className="py-1 pr-2">
                        <input type="date" className={editInput} value={editFields.workDate} onChange={(e) => setEditFields((f) => ({ ...f, workDate: e.target.value }))} />
                      </td>
                      <td className="py-1 pr-2">
                        <input type="text" className={editInput} value={editFields.name} onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))} />
                      </td>
                      <td className="py-1 pr-2">
                        <input type="text" className={editInput} placeholder="—" value={editFields.role} onChange={(e) => setEditFields((f) => ({ ...f, role: e.target.value }))} />
                      </td>
                      <td className="py-1 pr-2">
                        <input type="number" min={0.25} step={0.25} className={editInput} value={editFields.hours} onChange={(e) => setEditFields((f) => ({ ...f, hours: e.target.value }))} />
                      </td>
                      <td className="py-1 pr-2">
                        <input type="text" className={editInput} value={editFields.hourlyRate} onChange={(e) => setEditFields((f) => ({ ...f, hourlyRate: e.target.value }))} />
                      </td>
                      <td className="py-1 pr-2 text-gray-800">{centsToDollars(lineCostCents(Number(editFields.hours), Number(editFields.hourlyRate) * 100))}</td>
                      <td className="py-1 pr-2">
                        <input type="text" className={editInput} placeholder="—" value={editFields.taskDescription} onChange={(e) => setEditFields((f) => ({ ...f, taskDescription: e.target.value }))} />
                      </td>
                      <td className="py-1 pr-2">
                        <select
                          value={quality}
                          onChange={(e) => handleQualityChange(l.id, e.target.value)}
                          className={`w-full rounded border border-gray-300 bg-white px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-pink-400 ${QUALITY_COLORS[quality] ?? "text-gray-400"}`}
                        >
                          {QUALITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td className="py-1 pr-2">
                        <button
                          type="button"
                          onClick={() => setQualityPopup({ id: l.id, draft: notes })}
                          title={notes || "Add quality notes"}
                          className={`rounded p-1 transition-colors ${notes ? "text-pink-500 hover:text-pink-700" : "text-gray-300 hover:text-gray-500"}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                            <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.683 1.82a.75.75 0 0 0 .953.953l1.82-.683a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474ZM3.5 6.75c0-.966.784-1.75 1.75-1.75h1a.75.75 0 0 1 0 1.5h-1a.25.25 0 0 0-.25.25v5c0 .138.112.25.25.25h5a.25.25 0 0 0 .25-.25v-1a.75.75 0 0 1 1.5 0v1A1.75 1.75 0 0 1 10.25 13.5h-5A1.75 1.75 0 0 1 3.5 11.75v-5Z" />
                          </svg>
                        </button>
                      </td>
                      <td className="py-1 text-right whitespace-nowrap">
                        <button type="button" onClick={() => onSaveEdit(l.id)} className="text-xs font-medium text-pink-600 hover:text-pink-800">Save</button>
                        <button type="button" onClick={() => setEditingId(null)} className="ml-2 text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={l.id}>
                      <td className="py-2 pr-2 text-gray-600">{new Date(l.workDate).toLocaleDateString("en-US", { timeZone: "America/New_York" })}</td>
                      <td className="py-2 pr-2 text-gray-900">{l.name}</td>
                      <td className="py-2 pr-2 text-gray-500">{l.role || "—"}</td>
                      <td className="py-2 pr-2 text-gray-700">{l.hours}</td>
                      <td className="py-2 pr-2 text-gray-600">{centsToDollars(l.hourlyRateCents)}/hr</td>
                      <td className="py-2 pr-2 text-gray-800">{centsToDollars(lineCostCents(l.hours, l.hourlyRateCents))}</td>
                      <td className="py-2 pr-2 text-gray-500">{l.taskDescription || "—"}</td>
                      <td className="py-2 pr-2">
                        <select
                          value={quality}
                          onChange={(e) => handleQualityChange(l.id, e.target.value)}
                          className={`w-full rounded border border-gray-200 bg-white px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-pink-400 ${QUALITY_COLORS[quality] ?? "text-gray-400"}`}
                        >
                          {QUALITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td className="py-2 pr-2">
                        <button
                          type="button"
                          onClick={() => setQualityPopup({ id: l.id, draft: notes })}
                          title={notes || "Add quality notes"}
                          className={`rounded p-0.5 transition-colors ${notes ? "text-pink-500 hover:text-pink-700" : "text-gray-300 hover:text-gray-500"}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                            <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.683 1.82a.75.75 0 0 0 .953.953l1.82-.683a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474ZM3.5 6.75c0-.966.784-1.75 1.75-1.75h1a.75.75 0 0 1 0 1.5h-1a.25.25 0 0 0-.25.25v5c0 .138.112.25.25.25h5a.25.25 0 0 0 .25-.25v-1a.75.75 0 0 1 1.5 0v1A1.75 1.75 0 0 1 10.25 13.5h-5A1.75 1.75 0 0 1 3.5 11.75v-5Z" />
                          </svg>
                        </button>
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <button type="button" onClick={() => startEdit(l)} className="text-xs text-gray-500 hover:text-gray-700">Edit</button>
                        <button type="button" onClick={() => onRemove(l.id)} className="ml-2 text-xs text-red-500 hover:text-red-700">Remove</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    {qualityPopup ? (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={() => setQualityPopup(null)}
      >
        <div
          className="w-80 rounded-xl bg-white p-5 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="mb-3 text-sm font-semibold text-gray-800">Quality Notes</h3>
          <textarea
            autoFocus
            rows={4}
            value={qualityPopup.draft}
            onChange={(e) => setQualityPopup((p) => p ? { ...p, draft: e.target.value } : null)}
            placeholder="Add notes about work quality..."
            className="w-full resize-none rounded-lg border border-gray-200 p-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-400"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setQualityPopup(null)}
              className="rounded-lg px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleQualityNotesSave}
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
