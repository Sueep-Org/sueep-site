"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { centsToDollars } from "@/lib/erp/money";

export type LaborRow = {
  id: string;
  employeeId?: string | null;
  employeeName?: string | null;
  workDate: string;
  workerName: string;
  role: string | null;
  hours: string;
  hourlyRateCents: number;
  taskDescription: string | null;
};

export type LaborEmployeeOption = {
  id: string;
  firstName: string;
  lastName: string;
  hourlyPayCents: number | null;
  status: string;
};

const OTHER_VALUE = "__other__";

const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-gray-600";

function lineCostCents(hours: string, rateCents: number): number {
  const h = Number(hours);
  if (!Number.isFinite(h)) return 0;
  return Math.round(h * rateCents);
}

function employeeLabel(e: LaborEmployeeOption): string {
  const name = `${e.firstName} ${e.lastName}`.trim();
  return e.status === "INACTIVE" ? `${name} (inactive)` : name;
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

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setOpen(true);
    if (value) onChange("");
  }

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
        onChange={handleInputChange}
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

export function ProjectLaborSection({
  projectId,
  initialEntries,
  employees,
}: {
  projectId: string;
  initialEntries: LaborRow[];
  employees: LaborEmployeeOption[];
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [employeePick, setEmployeePick] = useState<string>("");
  const [hourlyRateStr, setHourlyRateStr] = useState("");

  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  useEffect(() => {
    if (!employeePick || employeePick === OTHER_VALUE) {
      setHourlyRateStr("");
      return;
    }
    const e = employees.find((x) => x.id === employeePick);
    if (e?.hourlyPayCents != null) {
      setHourlyRateStr((e.hourlyPayCents / 100).toFixed(2));
    } else {
      setHourlyRateStr("");
    }
  }, [employeePick, employees]);

  async function onDelete(entryId: string) {
    if (!confirm("Delete this labor entry?")) return;
    const res = await fetch(`/api/erp/projects/${projectId}/labor/${entryId}`, { method: "DELETE" });
    if (res.ok) {
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
      router.refresh();
    }
  }

  async function onAddLabor(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!employeePick) {
      setError("Choose an employee from the list, or “Other” if they are not in the roster.");
      return;
    }
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const workDate = String(fd.get("workDate") || "");
    const role = String(fd.get("role") || "").trim();
    const hours = Number(fd.get("hours"));
    const hourlyRate = hourlyRateStr.replace(/[$,]/g, "") || String(fd.get("hourlyRate") || "").replace(/[$,]/g, "");
    const taskDescription = String(fd.get("taskDescription") || "").trim();

    const picked = employees.find((x) => x.id === employeePick);
    const workerName =
      employeePick === OTHER_VALUE
        ? String(fd.get("workerName") || "").trim()
        : picked
          ? `${picked.firstName} ${picked.lastName}`.trim()
          : "";

    if (!workerName) {
      setError("Worker name is required.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/erp/projects/${projectId}/labor`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workDate: workDate || "",
          workerName,
          employeeId: employeePick !== OTHER_VALUE ? employeePick : undefined,
          role: role || undefined,
          hours,
          hourlyRate: Number(hourlyRate),
          taskDescription: taskDescription || undefined,
        }),
      });
      const data = (await res.json()) as {
        id?: string;
        employeeId?: string | null;
        employee?: { firstName?: string; lastName?: string } | null;
        workDate?: string;
        workerName?: string;
        role?: string | null;
        hours?: unknown;
        hourlyRateCents?: number;
        taskDescription?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || "Failed to add entry");
        setLoading(false);
        return;
      }
      const row: LaborRow = {
        id: data.id!,
        employeeId: data.employeeId ?? null,
        employeeName:
          data.employee && (data.employee.firstName || data.employee.lastName)
            ? `${data.employee.firstName || ""} ${data.employee.lastName || ""}`.trim()
            : null,
        workDate: data.workDate!,
        workerName: data.workerName!,
        role: data.role ?? null,
        hours: String(data.hours),
        hourlyRateCents: data.hourlyRateCents!,
        taskDescription: data.taskDescription ?? null,
      };
      setEntries((prev) => [row, ...prev]);
      e.currentTarget.reset();
      setEmployeePick("");
      setHourlyRateStr("");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  const totalLaborCents = entries.reduce((s, e) => s + lineCostCents(e.hours, e.hourlyRateCents), 0);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Labor log</h2>
          <p className="text-sm text-gray-700">
            Sum of lines: <span className="font-semibold text-gray-900">{centsToDollars(totalLaborCents)}</span>
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 pr-2 font-medium">Date</th>
                <th className="py-2 pr-2 font-medium">Worker</th>
                <th className="py-2 pr-2 font-medium">Role</th>
                <th className="py-2 pr-2 font-medium">Hours</th>
                <th className="py-2 pr-2 font-medium">Rate</th>
                <th className="py-2 pr-2 font-medium">Line $</th>
                <th className="py-2 pr-2 font-medium">Task</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-gray-500">
                    No labor entries yet.
                  </td>
                </tr>
              ) : (
                entries.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-2 text-gray-600">{new Date(r.workDate).toLocaleDateString()}</td>
                    <td className="py-2 pr-2 text-gray-900">
                      {r.employeeName || r.workerName}
                      {r.employeeName && r.employeeName !== r.workerName ? (
                        <span className="ml-1 text-xs text-gray-500">({r.workerName})</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2 text-gray-500">{r.role || "—"}</td>
                    <td className="py-2 pr-2 text-gray-700">{r.hours}</td>
                    <td className="py-2 pr-2 text-gray-600">{centsToDollars(r.hourlyRateCents)}/hr</td>
                    <td className="py-2 pr-2 text-gray-800">{centsToDollars(lineCostCents(r.hours, r.hourlyRateCents))}</td>
                    <td className="py-2 pr-2 text-gray-500">{r.taskDescription || "—"}</td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => onDelete(r.id)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <form onSubmit={onAddLabor} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Add labor entry</h2>
        <p className="mt-2 text-xs text-gray-500">
          Pick the employee from your roster so hours link to the right person and bill rates stay consistent. Use
          “Other” only when the worker is not in the list.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={label} htmlFor="l-workDate">
              Work date *
            </label>
            <input id="l-workDate" name="workDate" type="date" required className={input} />
          </div>
          <div className="sm:col-span-2 lg:col-span-2">
            <label className={label} htmlFor="l-employee">
              Employee *
            </label>
            <EmployeeCombobox
              employees={employees}
              value={employeePick}
              onChange={setEmployeePick}
            />
          </div>
          {employeePick === OTHER_VALUE ? (
            <div className="sm:col-span-2 lg:col-span-3">
              <label className={label} htmlFor="l-worker">
                Worker name *
              </label>
              <input id="l-worker" name="workerName" required className={input} placeholder="As it should appear on the log" />
            </div>
          ) : null}
          <div>
            <label className={label} htmlFor="l-role">
              Role
            </label>
            <input id="l-role" name="role" className={input} placeholder="PM, Cleaner…" />
          </div>
          <div>
            <label className={label} htmlFor="l-hours">
              Hours *
            </label>
            <input id="l-hours" name="hours" type="number" min={0.25} step={0.25} required className={input} />
          </div>
          <div>
            <label className={label} htmlFor="l-rate">
              Hourly rate (USD) *
            </label>
            <input
              id="l-rate"
              name="hourlyRate"
              type="text"
              required
              className={input}
              placeholder="28.84"
              value={hourlyRateStr}
              onChange={(ev) => setHourlyRateStr(ev.target.value)}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={label} htmlFor="l-task">
              Task
            </label>
            <input id="l-task" name="taskDescription" className={input} placeholder="Rough clean unit 590…" />
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
          {loading ? "Adding…" : "Add entry"}
        </button>
      </form>
    </div>
  );
}