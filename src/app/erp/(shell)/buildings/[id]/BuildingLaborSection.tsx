"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TRANSPORTATION_METHOD_OPTIONS } from "@/lib/erp/transportationMethods";
import { inputClass, labelClass } from "@/app/erp/components/ui";

export type LaborEmployeeOption = {
  id: string;
  firstName: string;
  lastName: string;
  hourlyPayCents: number | null;
  role: string | null;
  status: string;
};

type Unit = { projectId: string; unitNumber: string | null; status?: string };

type Props = {
  buildingId: string;
  units: Unit[];
  employees: LaborEmployeeOption[];
};

type WorkerRow = {
  key: string;
  employeeId: string;
  workerName: string;
  role: string;
  hours: string;
  hourlyRate: string;
};

type SplitResult = { projectId: string; unitNumber: string | null; workerName: string; ok: boolean; error?: string };

const OTHER_VALUE = "__other__";

const input = inputClass.md;
const label = labelClass.default;
const checkboxRow = "flex items-center gap-2 text-sm text-gray-700";
const checkboxInput = "h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500";

function employeeLabel(e: LaborEmployeeOption): string {
  const name = `${e.firstName} ${e.lastName}`.trim();
  return e.status === "INACTIVE" ? `${name} (inactive)` : name;
}

function newRow(): WorkerRow {
  return { key: Math.random().toString(36).slice(2), employeeId: "", workerName: "", role: "", hours: "", hourlyRate: "" };
}

function EmployeeCombobox({
  employees,
  value,
  onChange,
}: {
  employees: LaborEmployeeOption[];
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

  function handleSelect(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <input
        type="text"
        autoComplete="off"
        className={input}
        placeholder="Type to search…"
        value={open ? query : displayName}
        onFocus={() => { setQuery(""); setOpen(true); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg">
          {filtered.map((e) => (
            <li
              key={e.id}
              onMouseDown={(ev) => { ev.preventDefault(); handleSelect(e.id); }}
              className="cursor-pointer px-3 py-2 text-gray-900 hover:bg-pink-50 hover:text-pink-700"
            >
              {employeeLabel(e)}
            </li>
          ))}
          <li
            onMouseDown={(ev) => { ev.preventDefault(); handleSelect(OTHER_VALUE); }}
            className="cursor-pointer px-3 py-2 text-gray-500 hover:bg-pink-50 hover:text-pink-700"
          >
            Other (not in roster)
          </li>
        </ul>
      )}
    </div>
  );
}

export function BuildingLaborSection({ buildingId, units, employees }: Props) {
  const router = useRouter();
  const [workDate, setWorkDate] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }));
  const [transportationMethod, setTransportationMethod] = useState("");
  const [commuteHours, setCommuteHours] = useState("");
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());
  const [workers, setWorkers] = useState<WorkerRow[]>([newRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<SplitResult[] | null>(null);

  const unitCount = selectedUnitIds.size;

  function toggleUnit(projectId: string) {
    setSelectedUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  function toggleAllUnits() {
    setSelectedUnitIds((prev) => (prev.size === units.length ? new Set() : new Set(units.map((u) => u.projectId))));
  }

  function updateWorker(key: string, patch: Partial<WorkerRow>) {
    setWorkers((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function selectEmployee(key: string, employeeId: string) {
    const emp = employees.find((e) => e.id === employeeId);
    updateWorker(key, {
      employeeId,
      workerName: emp ? employeeLabel(emp).replace(" (inactive)", "") : "",
      hourlyRate: emp?.hourlyPayCents != null ? (emp.hourlyPayCents / 100).toFixed(2) : "",
      role: emp?.role ?? "",
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResults(null);

    if (unitCount === 0) return setError("Select at least one unit.");
    if (!transportationMethod) return setError("Select a transportation method.");

    const validWorkers = workers.filter((w) => w.workerName.trim() && w.hours.trim());
    if (validWorkers.length === 0) return setError("Add at least one worker with hours.");

    for (const w of validWorkers) {
      if (!Number.isFinite(Number(w.hours)) || Number(w.hours) <= 0) return setError(`Invalid hours for ${w.workerName}.`);
      if (!w.hourlyRate.trim()) return setError(`Enter an hourly rate for ${w.workerName}.`);
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/erp/buildings/${buildingId}/labor-split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workDate,
          transportationMethod,
          commuteHours: commuteHours.trim() ? Number(commuteHours) : undefined,
          projectIds: Array.from(selectedUnitIds),
          workers: validWorkers.map((w) => ({
            employeeId: w.employeeId === OTHER_VALUE ? null : w.employeeId || null,
            workerName: w.workerName.trim(),
            role: w.role.trim() || null,
            hours: Number(w.hours),
            hourlyRate: Number(w.hourlyRate),
          })),
        }),
      });
      const data = (await res.json()) as { results?: SplitResult[]; createdCount?: number; failedCount?: number; error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to log hours.");
        return;
      }
      setResults(data.results ?? []);
      if ((data.failedCount ?? 0) === 0) {
        setWorkers([newRow()]);
      }
      router.refresh();
    } catch {
      setError("Failed to log hours.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-sm text-gray-600">
        Log a crew&apos;s hours once and split each worker&apos;s total evenly across the units they worked today. This creates a
        real labor entry on each selected unit, so it shows up on that unit&apos;s own Labor tab.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="bl-workDate">Date</label>
            <input id="bl-workDate" type="date" required className={input} value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="bl-transport">Transportation</label>
            <select
              id="bl-transport"
              required
              className={input}
              value={transportationMethod}
              onChange={(e) => setTransportationMethod(e.target.value)}
            >
              <option value="">Select…</option>
              {TRANSPORTATION_METHOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={label} htmlFor="bl-commute">Commute hours (optional, split across units like worked hours)</label>
          <input
            id="bl-commute"
            type="number"
            min={0}
            step="0.25"
            className={input}
            value={commuteHours}
            onChange={(e) => setCommuteHours(e.target.value)}
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className={label}>Units worked today</span>
            <button type="button" onClick={toggleAllUnits} className="text-xs text-pink-600 hover:underline">
              {selectedUnitIds.size === units.length ? "Clear all" : "Select all"}
            </button>
          </div>
          {units.length === 0 ? (
            <p className="text-sm text-gray-500">No units on this building yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 rounded-md border border-gray-200 p-3 sm:grid-cols-3">
              {units.map((u) => (
                <label key={u.projectId} className={checkboxRow}>
                  <input
                    type="checkbox"
                    className={checkboxInput}
                    checked={selectedUnitIds.has(u.projectId)}
                    onChange={() => toggleUnit(u.projectId)}
                  />
                  {u.unitNumber || "—"}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <span className={label}>Workers</span>
          {workers.map((w) => {
            const totalHours = Number(w.hours);
            const perUnit = unitCount > 0 && Number.isFinite(totalHours) && totalHours > 0 ? totalHours / unitCount : null;
            return (
              <div key={w.key} className="rounded-md border border-gray-200 p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <div className="sm:col-span-2">
                    <label className={label}>Worker</label>
                    <EmployeeCombobox employees={employees} value={w.employeeId} onChange={(id) => selectEmployee(w.key, id)} />
                    {w.employeeId === OTHER_VALUE && (
                      <input
                        type="text"
                        placeholder="Worker name"
                        className={`${input} mt-2`}
                        value={w.workerName}
                        onChange={(e) => updateWorker(w.key, { workerName: e.target.value })}
                      />
                    )}
                  </div>
                  <div>
                    <label className={label}>Total hours today</label>
                    <input
                      type="number"
                      min={0}
                      step="0.25"
                      className={input}
                      value={w.hours}
                      onChange={(e) => updateWorker(w.key, { hours: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={label}>Hourly rate ($)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className={input}
                      value={w.hourlyRate}
                      onChange={(e) => updateWorker(w.key, { hourlyRate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    {perUnit != null ? `${w.hours} hrs ÷ ${unitCount} unit${unitCount === 1 ? "" : "s"} = ${perUnit.toFixed(2)} hrs/unit` : "Enter hours and select units"}
                  </p>
                  {workers.length > 1 && (
                    <button type="button" onClick={() => setWorkers((rows) => rows.filter((r) => r.key !== w.key))} className="text-xs text-red-600 hover:underline">
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <button type="button" onClick={() => setWorkers((rows) => [...rows, newRow()])} className="text-sm text-pink-600 hover:underline">
            + Add worker
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700 disabled:opacity-50"
        >
          {submitting ? "Logging…" : "Log hours"}
        </button>
      </form>

      {results && (
        <div className="rounded-md border border-gray-200 p-3">
          <p className="mb-2 text-sm font-medium text-gray-900">
            {results.filter((r) => r.ok).length} of {results.length} entries logged
          </p>
          <ul className="space-y-1 text-sm">
            {results.map((r, i) => (
              <li key={i} className={r.ok ? "text-gray-600" : "text-red-600"}>
                Unit {r.unitNumber || "—"} · {r.workerName}: {r.ok ? "logged" : r.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
