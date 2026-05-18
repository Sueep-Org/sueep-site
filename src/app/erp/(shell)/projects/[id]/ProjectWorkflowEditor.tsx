"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { deriveProjectLifecycle, type ProjectLifecycle } from "@/lib/erp/projectLifecycle";
import { PROJECT_SEGMENT_OPTIONS } from "@/lib/erp/projectSegments";

const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-gray-600";

type PipelineOption = { id: string; label: string };

type Props = {
  projectId: string;
  status: string;
  projectDateIso: string | null;
  segment: string;
  hubspotPipelineId: string | null;
  isManual: boolean;
  pipelineOptions: PipelineOption[];
};

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function ProjectWorkflowEditor({ projectId, status, projectDateIso, segment, hubspotPipelineId, isManual, pipelineOptions }: Props) {
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
    const nextPipelineId = isManual ? (String(fd.get("pipelineId") || "").trim() || null) : undefined;

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
      const payload: Record<string, unknown> = {
        status: nextStatus,
        segment: nextSegment,
        projectDate: nextProjectDate,
      };
      if (nextPipelineId !== undefined) payload.hubspotPipelineId = nextPipelineId;

      const res = await fetch(`/api/erp/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
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
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Workflow & segment</h2>
      <p className="mt-1 text-[11px] text-gray-500">Move projects between upcoming, WIP, and completed, and reclassify segment.</p>
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
        {isManual && pipelineOptions.length > 0 && (
          <div>
            <label className={label} htmlFor="wf-pipeline">
              Category tab
            </label>
            <select id="wf-pipeline" name="pipelineId" className={input} defaultValue={hubspotPipelineId ?? ""}>
              <option value="">Manual (no category)</option>
              {pipelineOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
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
        className="mt-4 rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-700 disabled:opacity-50"
      >
        {loading ? "Saving…" : "Save workflow"}
      </button>
    </form>
  );
}