"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
};

export type ChangeOrderLaborerEmployeeOption = {
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

function lineCostCents(hours: number, rateCents: number): number {
  if (!Number.isFinite(hours)) return 0;
  return Math.round(hours * rateCents);
}

function employeeLabel(e: ChangeOrderLaborerEmployeeOption): string {
  const name = `${e.firstName} ${e.lastName}`.trim();
  return e.status === "INACTIVE" ? `${name} (inactive)` : name;
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

  useEffect(() => {
    setLaborers(initialLaborers);
  }, [initialLaborers]);

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
    const role = String(fd.get("role") || "").trim();
    const hours = Number(fd.get("hours"));
    const hourlyRate = hourlyRateStr.replace(/[$,]/g, "") || String(fd.get("hourlyRate") || "").replace(/[$,]/g, "");
    const taskDescription = String(fd.get("taskDescription") || "").trim();

    const workerName =
      employeePick === OTHER_VALUE
        ? String(fd.get("workerName") || "").trim()
        : undefined;

    if (employeePick === OTHER_VALUE && !workerName) {
      setError("Worker name is required.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(
        `/api/erp/projects/${projectId}/change-orders/${changeOrderId}/laborers`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            employeeId: employeePick !== OTHER_VALUE ? employeePick : OTHER_VALUE,
            workerName,
            workDate,
            role: role || undefined,
            hours,
            hourlyRate: Number(hourlyRate),
            taskDescription: taskDescription || undefined,
          }),
        },
      );
      const data = (await res.json()) as Partial<ChangeOrderLaborerRow> & { error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to add entry");
        setLoading(false);
        return;
      }
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
      };
      setLaborers((prev) => [row, ...prev]);
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

  async function onRemove(id: string) {
    if (!confirm("Remove this labor entry?")) return;
    const res = await fetch(`/api/erp/change-order-laborers/${id}`, { method: "DELETE" });
    if (res.ok) {
      setLaborers((prev) => prev.filter((l) => l.id !== id));
      router.refresh();
    }
  }

  const totalCents = laborers.reduce((s, l) => s + lineCostCents(l.hours, l.hourlyRateCents), 0);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Labor log</h2>
          <p className="text-sm text-gray-700">
            Sum of lines: <span className="font-semibold text-gray-900">{centsToDollars(totalCents)}</span>
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
              {laborers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-gray-500">
                    No labor entries yet.
                  </td>
                </tr>
              ) : (
                laborers.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 pr-2 text-gray-600">{new Date(l.workDate).toLocaleDateString()}</td>
                    <td className="py-2 pr-2 text-gray-900">{l.name}</td>
                    <td className="py-2 pr-2 text-gray-500">{l.role || "—"}</td>
                    <td className="py-2 pr-2 text-gray-700">{l.hours}</td>
                    <td className="py-2 pr-2 text-gray-600">{centsToDollars(l.hourlyRateCents)}/hr</td>
                    <td className="py-2 pr-2 text-gray-800">{centsToDollars(lineCostCents(l.hours, l.hourlyRateCents))}</td>
                    <td className="py-2 pr-2 text-gray-500">{l.taskDescription || "—"}</td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => onRemove(l.id)}
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
            <select
              id="col-employee"
              required
              className={input}
              value={employeePick}
              onChange={(ev) => setEmployeePick(ev.target.value)}
            >
              <option value="" disabled>Select employee…</option>
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
              <label className={label} htmlFor="col-worker">Worker name *</label>
              <input id="col-worker" name="workerName" required className={input} placeholder="As it should appear on the log" />
            </div>
          ) : null}
          <div>
            <label className={label} htmlFor="col-role">Role</label>
            <input id="col-role" name="role" className={input} placeholder="PM, Cleaner…" />
          </div>
          <div>
            <label className={label} htmlFor="col-hours">Hours *</label>
            <input id="col-hours" name="hours" type="number" min={0.25} step={0.25} required className={input} />
          </div>
          <div>
            <label className={label} htmlFor="col-rate">Hourly rate (USD) *</label>
            <input
              id="col-rate"
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
            <label className={label} htmlFor="col-task">Task</label>
            <input id="col-task" name="taskDescription" className={input} placeholder="Rough clean unit 590…" />
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-red-400" role="alert">{error}</p> : null}
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
