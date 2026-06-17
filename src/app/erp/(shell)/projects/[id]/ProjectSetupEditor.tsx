"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { deriveProjectLifecycle, type ProjectLifecycle } from "@/lib/erp/projectLifecycle";
import { PROJECT_SEGMENT_OPTIONS } from "@/lib/erp/projectSegments";
import { SERVICE_TYPE_OPTIONS } from "@/lib/erp/serviceTypes";

const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-gray-600";

type PipelineOption = { id: string; label: string };
type Employee = { id: string; firstName: string; lastName: string };

type Props = {
  projectId: string;
  status: string;
  segment: string;
  hubspotPipelineId: string | null;
  isManual: boolean;
  pipelineOptions: PipelineOption[];
  supervisor: string | null;
  employees: Employee[];
  projectDateIso: string | null;
  projectEndDateIso: string | null;
  description: string | null;
  showServiceType: boolean;
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
  employees,
  projectDateIso,
  projectEndDateIso,
  description,
  showServiceType,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const currentLifecycle = useMemo(() => deriveProjectLifecycle(status, projectDateIso), [status, projectDateIso]);
  const [lifecycle, setLifecycle] = useState<ProjectLifecycle>(currentLifecycle);
  const [startDate, setStartDate] = useState(toInputDate(projectDateIso));
  const [endDate, setEndDate] = useState(toInputDate(projectEndDateIso));

  // Supervisor — searchable combobox
  const employeeNames = employees.map((e) => `${e.firstName} ${e.lastName}`.trim());
  const [supervisorValue, setSupervisorValue] = useState(supervisor ?? "");
  const [supervisorQuery, setSupervisorQuery] = useState(supervisor ?? "");
  const [showSupervisorDropdown, setShowSupervisorDropdown] = useState(false);
  const supervisorBlurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filteredEmployees = employeeNames.filter((name) =>
    name.toLowerCase().includes(supervisorQuery.toLowerCase())
  );

  // Service type
  const isKnownServiceType = description ? (SERVICE_TYPE_OPTIONS as readonly string[]).includes(description) : false;
  const [serviceTypeSelected, setServiceTypeSelected] = useState(
    description && isKnownServiceType ? description : description ? "__other__" : "",
  );
  const [serviceTypeCustom, setServiceTypeCustom] = useState(description && !isKnownServiceType ? description : "");


  function handleLifecycleChange(next: ProjectLifecycle) {
    setLifecycle(next);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const current = startDate ? new Date(startDate) : null;

    if (next === "COMPLETED") {
      if (!endDate) setEndDate(toIsoDate(today));
    } else if (next === "UPCOMING") {
      if (!current || current.getTime() <= today.getTime()) setStartDate(toIsoDate(tomorrow));
    } else {
      if (!current) setStartDate(toIsoDate(today));
      else if (current.getTime() > today.getTime()) setStartDate(toIsoDate(today));
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
    const current = startDate ? new Date(startDate) : null;

    let nextStatus = "ACTIVE";
    let nextProjectDate: string | null = startDate || null;
    if (lifecycle === "COMPLETED") {
      nextStatus = "COMPLETE";
    } else if (lifecycle === "UPCOMING") {
      nextStatus = "ACTIVE";
      if (!current || current.getTime() <= today.getTime()) nextProjectDate = toIsoDate(tomorrow);
    } else {
      nextStatus = "ACTIVE";
      if (!current) nextProjectDate = toIsoDate(today);
      else if (current.getTime() > today.getTime()) nextProjectDate = toIsoDate(today);
    }

    const serviceTypeValue = showServiceType
      ? (serviceTypeSelected === "__other__" ? serviceTypeCustom.trim() : serviceTypeSelected) || null
      : undefined;

    const payload: Record<string, unknown> = {
      status: nextStatus,
      segment: nextSegment,
      projectDate: nextProjectDate,
      projectEndDate: endDate || null,
      supervisor: supervisorValue.trim(),
    };
    if (nextPipelineId !== undefined) payload.hubspotPipelineId = nextPipelineId;
    if (serviceTypeValue !== undefined) payload.description = serviceTypeValue;

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
              {PROJECT_SEGMENT_OPTIONS.map((opt) => (
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

      {showServiceType && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Work Type</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="ps-st">Type</label>
              <select id="ps-st" className={input} value={serviceTypeSelected} onChange={(e) => setServiceTypeSelected(e.target.value)}>
                <option value="">— None —</option>
                {SERVICE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
                <option value="__other__">Other…</option>
              </select>
            </div>
            {serviceTypeSelected === "__other__" && (
              <div>
                <label className={label} htmlFor="ps-st-custom">Custom</label>
                <input
                  id="ps-st-custom"
                  type="text"
                  className={input}
                  value={serviceTypeCustom}
                  onChange={(e) => setServiceTypeCustom(e.target.value)}
                  placeholder="Describe the work"
                />
              </div>
            )}
          </div>
        </div>
      )}

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
