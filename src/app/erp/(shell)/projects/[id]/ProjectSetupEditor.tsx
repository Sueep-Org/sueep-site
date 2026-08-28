"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { deriveProjectLifecycle, type ProjectLifecycle } from "@/lib/erp/projectLifecycle";
import { PROJECT_SEGMENT_OPTIONS } from "@/lib/erp/projectSegments";
import { inputClass, labelClass } from "@/app/erp/components/ui";

const input = inputClass.md;
const label = labelClass.default;

type PipelineOption = { id: string; label: string };
type Employee = { id: string; firstName: string; lastName: string };
type ErpSupervisor = { id: string; email: string; displayName: string };

type Props = {
  projectId: string;
  status: string;
  segment: string;
  hubspotPipelineId: string | null;
  isManual: boolean;
  pipelineOptions: PipelineOption[];
  supervisor: string | null;
  supervisorUserId: string | null;
  employees: Employee[];
  erpSupervisors: ErpSupervisor[];
  projectDateIso: string | null;
  projectEndDateIso: string | null;
  hasActiveChangeOrder?: boolean;
};

function toInputDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function ProjectSetupEditor({
  projectId,
  status,
  segment,
  hubspotPipelineId,
  isManual,
  pipelineOptions,
  supervisor,
  supervisorUserId,
  employees,
  erpSupervisors,
  projectDateIso,
  projectEndDateIso,
  hasActiveChangeOrder = false,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const currentLifecycle = useMemo(
    () => deriveProjectLifecycle(status, projectDateIso, hasActiveChangeOrder),
    [status, projectDateIso, hasActiveChangeOrder]
  );
  const [lifecycle, setLifecycle] = useState<ProjectLifecycle>(currentLifecycle);
  const [startDate, setStartDate] = useState(toInputDate(projectDateIso));
  const [endDate, setEndDate] = useState(toInputDate(projectEndDateIso));

  // Supervisor — searchable combobox
  // Dedupe by normalized name: duplicate Employee rows for the same person
  // (e.g. two profiles created for the same hire) would otherwise show up
  // as repeated entries in this list.
  const employeeNames = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const e of employees) {
      const name = `${e.firstName} ${e.lastName}`.trim();
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
    return names;
  }, [employees]);
  const [supervisorValue, setSupervisorValue] = useState(supervisor ?? "");
  const [supervisorQuery, setSupervisorQuery] = useState(supervisor ?? "");
  const [showSupervisorDropdown, setShowSupervisorDropdown] = useState(false);
  const supervisorBlurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filteredEmployees = employeeNames.filter((name) =>
    name.toLowerCase().includes(supervisorQuery.toLowerCase())
  );

  // ERP supervisor link
  const [selectedSupervisorUserId, setSelectedSupervisorUserId] = useState(supervisorUserId ?? "");


  function handleLifecycleChange(next: ProjectLifecycle) {
    setLifecycle(next);
    if (startDate) return;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (next === "COMPLETED") {
      if (!endDate) setEndDate(toIsoDate(today));
    } else if (next === "UPCOMING") {
      setStartDate(toIsoDate(tomorrow));
    } else {
      setStartDate(toIsoDate(today));
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const fd = new FormData(e.currentTarget);
    const nextSegment = String(fd.get("segment") || segment);
    const nextPipelineId = isManual ? (String(fd.get("pipelineId") || "").trim() || null) : undefined;
    if (!supervisorValue.trim()) { setError("Project Manager is required"); return; }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // The dropdown only ever offers Upcoming/WIP/Completed — it can't
    // represent ON_HOLD or ARCHIVED (currentLifecycle can be either, since
    // deriveProjectLifecycle reports them distinctly even though there's no
    // matching <option>). So status is only ever included in the payload
    // when the user actually changed the dropdown; left untouched, a save
    // here can no longer silently flip an ON_HOLD or ARCHIVED project into
    // ACTIVE/COMPLETE just because some other field on the form changed.
    const lifecycleChanged = lifecycle !== currentLifecycle;
    const nextStatus = lifecycle === "COMPLETED" ? "COMPLETE" : "ACTIVE";
    // An end date is required to mark a project complete — the day it was
    // actually finished, not just whatever day someone happened to save
    // this form (the completion-digest email groups by that date). The API
    // enforces this too; checking here just avoids a round-trip.
    if (lifecycleChanged && nextStatus === "COMPLETE" && !endDate) {
      setError("End date is required to mark this project complete.");
      return;
    }
    let nextProjectDate: string | null = startDate || null;
    if (!nextProjectDate) {
      nextProjectDate = lifecycle === "UPCOMING" ? toIsoDate(tomorrow) : toIsoDate(today);
    }

    const payload: Record<string, unknown> = {
      segment: nextSegment,
      projectDate: nextProjectDate,
      projectEndDate: endDate || null,
      supervisor: supervisorValue.trim(),
      supervisorUserId: selectedSupervisorUserId || null,
    };
    if (lifecycleChanged) payload.status = nextStatus;
    if (nextPipelineId !== undefined) payload.hubspotPipelineId = nextPipelineId;

    setLoading(true);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setError(data.error || "Update failed"); return; }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-6">

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status &amp; Segment</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={label} htmlFor="ps-lifecycle">Lifecycle</label>
            <select
              id="ps-lifecycle"
              name="lifecycle"
              className={input}
              value={lifecycle}
              onChange={(e) => handleLifecycleChange(e.target.value as ProjectLifecycle)}
            >
              <option value="UPCOMING">Upcoming</option>
              <option value="ACTIVE">WIP</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="ps-segment">Segment</label>
            <select id="ps-segment" name="segment" className={input} defaultValue={segment}>
              {PROJECT_SEGMENT_OPTIONS.filter((opt) => opt.value !== "REAL_ESTATE" || segment === "REAL_ESTATE").map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          {isManual && pipelineOptions.length > 0 && (
            <div>
              <label className={label} htmlFor="ps-pipeline">Category tab</label>
              <select id="ps-pipeline" name="pipelineId" className={input} defaultValue={hubspotPipelineId ?? ""}>
                <option value="">Manual (no category)</option>
                {pipelineOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Manager</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {erpSupervisors.length > 0 && (
            <div>
              <label className={label} htmlFor="ps-supervisor-user">Assigned Supervisor (ERP)</label>
              <select
                id="ps-supervisor-user"
                className={input}
                value={selectedSupervisorUserId}
                onChange={(e) => {
                  setSelectedSupervisorUserId(e.target.value);
                }}
              >
                <option value="">— Unassigned —</option>
                {erpSupervisors.map((s) => (
                  <option key={s.id} value={s.id}>{s.displayName} ({s.email})</option>
                ))}
              </select>
            </div>
          )}
          <div className="relative">
            <label className={label} htmlFor="ps-pm">Project Manager</label>
            <input
              id="ps-pm"
              type="text"
              className={input}
              value={supervisorQuery}
              placeholder="Search employees…"
              autoComplete="off"
              onChange={(e) => {
                setSupervisorQuery(e.target.value);
                setSupervisorValue(e.target.value);
                setShowSupervisorDropdown(true);
              }}
              onFocus={() => setShowSupervisorDropdown(true)}
              onBlur={() => {
                supervisorBlurTimeout.current = setTimeout(() => setShowSupervisorDropdown(false), 150);
              }}
            />
            {showSupervisorDropdown && filteredEmployees.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg text-sm">
                {filteredEmployees.map((name) => (
                  <li
                    key={name}
                    className="cursor-pointer px-3 py-2 hover:bg-pink-50 hover:text-pink-700"
                    onMouseDown={() => {
                      if (supervisorBlurTimeout.current) clearTimeout(supervisorBlurTimeout.current);
                      setSupervisorValue(name);
                      setSupervisorQuery(name);
                      setShowSupervisorDropdown(false);
                    }}
                  >
                    {name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Schedule</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="ps-start">Start date</label>
            <input
              id="ps-start"
              type="date"
              className={input}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className={label} htmlFor="ps-end">End date</label>
            <input
              id="ps-end"
              type="date"
              className={input}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {error ? <p className="text-xs text-red-400" role="alert">{error}</p> : null}

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500 disabled:opacity-50"
      >
        {loading ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
