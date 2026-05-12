"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  "mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-zinc-400";

function lineCostCents(hours: string, rateCents: number): number {
  const h = Number(hours);
  if (!Number.isFinite(h)) return 0;
  return Math.round(h * rateCents);
}

function employeeLabel(e: LaborEmployeeOption): string {
  const name = `${e.firstName} ${e.lastName}`.trim();
  return e.status === "INACTIVE" ? `${name} (inactive)` : name;
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
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Labor log</h2>
          <p className="text-sm text-zinc-300">
            Sum of lines: <span className="font-semibold text-white">{centsToDollars(totalLaborCents)}</span>
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
              <tr>
                <th className="py-2 pr-2 font-medium">Date</th>
                <th className="py-2 pr-2 font-medium">Worker</th>
                <th className="py-2 pr-2 font-medium">Role</th>
                <th className="py-2 pr-2 font-medium">Hours</th>
                <th className="py-2 pr-2 font-medium">Rate</th>
                <th className="py-2 pr-2 font-medium">Line $</th>
                <th className="py-2 font-medium">Task</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-zinc-500">
                    No labor entries yet.
                  </td>
                </tr>
              ) : (
                entries.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-2 text-zinc-300">{new Date(r.workDate).toLocaleDateString()}</td>
                    <td className="py-2 pr-2 text-white">
                      {r.employeeName || r.workerName}
                      {r.employeeName && r.employeeName !== r.workerName ? (
                        <span className="ml-1 text-xs text-zinc-500">({r.workerName})</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2 text-zinc-400">{r.role || "—"}</td>
                    <td className="py-2 pr-2 text-zinc-300">{r.hours}</td>
                    <td className="py-2 pr-2 text-zinc-300">{centsToDollars(r.hourlyRateCents)}/hr</td>
                    <td className="py-2 pr-2 text-zinc-200">{centsToDollars(lineCostCents(r.hours, r.hourlyRateCents))}</td>
                    <td className="py-2 text-zinc-500">{r.taskDescription || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <form onSubmit={onAddLabor} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Add labor entry</h2>
        <p className="mt-2 text-xs text-zinc-500">
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
            <select
              id="l-employee"
              required
              className={input}
              value={employeePick}
              onChange={(ev) => setEmployeePick(ev.target.value)}
            >
              <option value="" disabled>
                Select employee…
              </option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {employeeLabel(emp)}
                </option>
              ))}
              <option value={OTHER_VALUE}>Other (not in roster — type name)</option>
            </select>
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