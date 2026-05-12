"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { centsToDollars } from "@/lib/erp/money";

export type LaborRow = {
  id: string;
  workDate: string;
  workerName: string;
  role: string | null;
  hours: string;
  hourlyRateCents: number;
  taskDescription: string | null;
};

const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-zinc-600";

function lineCostCents(hours: string, rateCents: number): number {
  const h = Number(hours);
  if (!Number.isFinite(h)) return 0;
  return Math.round(h * rateCents);
}

export function ProjectLaborSection({
  projectId,
  initialEntries,
}: {
  projectId: string;
  initialEntries: LaborRow[];
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  async function onAddLabor(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const workDate = String(fd.get("workDate") || "");
    const workerName = String(fd.get("workerName") || "").trim();
    const role = String(fd.get("role") || "").trim();
    const hours = Number(fd.get("hours"));
    const hourlyRate = String(fd.get("hourlyRate") || "").replace(/[$,]/g, "");
    const taskDescription = String(fd.get("taskDescription") || "").trim();

    try {
      const res = await fetch(`/api/erp/projects/${projectId}/labor`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workDate: workDate ? new Date(workDate).toISOString() : "",
          workerName,
          role: role || undefined,
          hours,
          hourlyRate: Number(hourlyRate),
          taskDescription: taskDescription || undefined,
        }),
      });
      const data = (await res.json()) as {
        id?: string;
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
        workDate: data.workDate!,
        workerName: data.workerName!,
        role: data.role ?? null,
        hours: String(data.hours),
        hourlyRateCents: data.hourlyRateCents!,
        taskDescription: data.taskDescription ?? null,
      };
      setEntries((prev) => [row, ...prev]);
      e.currentTarget.reset();
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
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Labor log</h2>
          <p className="text-sm text-zinc-700">
            Sum of lines: <span className="font-semibold text-zinc-900">{centsToDollars(totalLaborCents)}</span>
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase text-zinc-500">
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
            <tbody className="divide-y divide-gray-200">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-zinc-500">
                    No labor entries yet.
                  </td>
                </tr>
              ) : (
                entries.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-2 text-zinc-700">{new Date(r.workDate).toLocaleDateString()}</td>
                    <td className="py-2 pr-2 text-zinc-900">{r.workerName}</td>
                    <td className="py-2 pr-2 text-zinc-600">{r.role || "—"}</td>
                    <td className="py-2 pr-2 text-zinc-700">{r.hours}</td>
                    <td className="py-2 pr-2 text-zinc-700">{centsToDollars(r.hourlyRateCents)}/hr</td>
                    <td className="py-2 pr-2 text-zinc-800">{centsToDollars(lineCostCents(r.hours, r.hourlyRateCents))}</td>
                    <td className="py-2 text-zinc-500">{r.taskDescription || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <form onSubmit={onAddLabor} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Add labor entry</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={label} htmlFor="l-workDate">
              Work date *
            </label>
            <input id="l-workDate" name="workDate" type="date" required className={input} />
          </div>
          <div>
            <label className={label} htmlFor="l-worker">
              Worker name *
            </label>
            <input id="l-worker" name="workerName" required className={input} />
          </div>
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
            <input id="l-rate" name="hourlyRate" type="text" required className={input} placeholder="28.84" />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={label} htmlFor="l-task">
              Task
            </label>
            <input id="l-task" name="taskDescription" className={input} placeholder="Rough clean unit 590…" />
          </div>
        </div>
        {error ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
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
