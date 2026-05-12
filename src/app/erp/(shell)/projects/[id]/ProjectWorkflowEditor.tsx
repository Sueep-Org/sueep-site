"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { deriveProjectLifecycle, type ProjectLifecycle } from "@/lib/erp/projectLifecycle";
import { PROJECT_SEGMENT_OPTIONS } from "@/lib/erp/projectSegments";

const input =
  "mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-zinc-400";

type Props = {
  projectId: string;
  status: string;
  projectDateIso: string | null;
  segment: string;
};

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function ProjectWorkflowEditor({ projectId, status, projectDateIso, segment }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const currentLifecycle = useMemo(() => deriveProjectLifecycle(status, projectDateIso), [status, projectDateIso]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);

    const lifecycle = String(fd.get("lifecycle") || "ACTIVE") as ProjectLifecycle;
    const nextSegment = String(fd.get("segment") || "OTHER");

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const currentDate = projectDateIso ? new Date(projectDateIso) : null;
    let nextStatus = "ACTIVE";
    let nextProjectDate: string | null = currentDate ? toIsoDate(currentDate) : null;

    if (lifecycle === "COMPLETED") {
      nextStatus = "COMPLETE";
    } else if (lifecycle === "UPCOMING") {
      nextStatus = "ACTIVE";
      if (!currentDate || currentDate.getTime() <= today.getTime()) nextProjectDate = toIsoDate(tomorrow);
    } else {
      nextStatus = "ACTIVE";
      if (!currentDate) nextProjectDate = toIsoDate(today);
      else if (currentDate.getTime() > today.getTime()) nextProjectDate = toIsoDate(today);
    }

    try {
      const res = await fetch(`/api/erp/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          segment: nextSegment,
          projectDate: nextProjectDate,
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
    <form onSubmit={onSubmit} className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Workflow & segment</h2>
      <p className="mt-1 text-[11px] text-zinc-500">Move projects between upcoming, WIP, and completed, and reclassify segment.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="wf-lifecycle">
            Lifecycle
          </label>
          <select id="wf-lifecycle" name="lifecycle" className={input} defaultValue={currentLifecycle}>
            <option value="UPCOMING">Upcoming</option>
            <option value="ACTIVE">WIP</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="wf-segment">
            Segment
          </label>
          <select id="wf-segment" name="segment" className={input} defaultValue={segment}>
            {PROJECT_SEGMENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
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
        {loading ? "Saving…" : "Save workflow"}
      </button>
    </form>
  );
}