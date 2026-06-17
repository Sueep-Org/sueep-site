"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-gray-600";

type Props = {
  projectId: string;
  projectDateIso: string | null;
  projectEndDateIso: string | null;
};

function toInputDate(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function ProjectDatesEditor({ projectId, projectDateIso, projectEndDateIso }: Props) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const projectDate = fd.get("projectDate");
    const projectEndDate = fd.get("projectEndDate");
    try {
      const res = await fetch(`/api/erp/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectDate: projectDate ? String(projectDate) : null,
          projectEndDate: projectEndDate ? String(projectEndDate) : null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Update failed");
        setLoading(false);
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
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Schedule (calendar & Gantt)</h2>
      <p className="mt-1 text-[11px] text-gray-400">
        Start and end dates control how this job appears on the Schedule page. End date is also used as the completion date for billing.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="edit-projectDate">
            Start date
          </label>
          <input
            id="edit-projectDate"
            name="projectDate"
            type="date"
            className={input}
            defaultValue={toInputDate(projectDateIso)}
          />
        </div>
        <div>
          <label className={label} htmlFor="edit-projectEndDate">
            End date
          </label>
          <input
            id="edit-projectEndDate"
            name="projectEndDate"
            type="date"
            className={input}
            defaultValue={toInputDate(projectEndDateIso)}
          />
        </div>
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
        {loading ? "Saving…" : "Save dates"}
      </button>
    </form>
  );
}