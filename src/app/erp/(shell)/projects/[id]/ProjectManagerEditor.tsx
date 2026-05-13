"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const DEFAULT_PM = "David Rodriguez";

const inputCls =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const labelCls = "block text-xs font-medium text-gray-600";

type Employee = { id: string; firstName: string; lastName: string };

type Props = {
  projectId: string;
  supervisor: string | null;
  employees: Employee[];
};

export function ProjectManagerEditor({ projectId, supervisor, employees }: Props) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const employeeNames = employees.map((e) => `${e.firstName} ${e.lastName}`.trim());
  const effectiveSupervisor = supervisor || DEFAULT_PM;
  const isKnown = employeeNames.includes(effectiveSupervisor);

  const [selected, setSelected] = useState(isKnown ? effectiveSupervisor : "__other__");
  const [custom, setCustom] = useState(isKnown ? "" : effectiveSupervisor);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const value = selected === "__other__" ? custom.trim() : selected;
    if (!value) {
      setError("Project Manager name is required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ supervisor: value }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Update failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Project Manager</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="pm-select">
            Assign PM
          </label>
          <select
            id="pm-select"
            className={inputCls}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {employeeNames.includes(DEFAULT_PM) ? null : (
              <option value={DEFAULT_PM}>{DEFAULT_PM}</option>
            )}
            {employeeNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value="__other__">Other…</option>
          </select>
        </div>
        {selected === "__other__" && (
          <div>
            <label className={labelCls} htmlFor="pm-custom">
              Name
            </label>
            <input
              id="pm-custom"
              type="text"
              className={inputCls}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Full name"
            />
          </div>
        )}
      </div>
      {error ? (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="mt-4 rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500 disabled:opacity-50"
      >
        {loading ? "Saving…" : "Save PM"}
      </button>
    </form>
  );
}
