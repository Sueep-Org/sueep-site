"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DetailTabs } from "@/app/erp/components/DetailTabs";
import { ChangeOrderLaborersSection } from "./ChangeOrderLaborersSection";
import { ChangeOrderMaterialsSection, type CoMaterialRow } from "./ChangeOrderMaterialsSection";
import { ProjectSafetySection } from "../../ProjectSafetySection";
import type { SafetyCheck } from "../../ProjectSafetySection";
import { centsToDollars } from "@/lib/erp/money";

const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-gray-600";

const STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "VOID", "BILLING", "COMPLETED"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_COLORS: Record<Status, string> = {
  DRAFT: "bg-gray-200 text-gray-700",
  SUBMITTED: "bg-blue-100 text-blue-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  VOID: "bg-amber-100 text-amber-700",
  BILLING: "bg-emerald-100 text-emerald-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
};

export type ChangeOrderDetailData = {
  id: string;
  createdAt: string;
  requestedDate: string | null;
  startDate: string | null;
  completedAt: string | null;
  title: string;
  description: string | null;
  requestedBy: string | null;
  supervisor: string | null;
  status: Status;
  billingStatus: string | null;
  percentInvoiced: number;
  estimatedCostCents: number | null;
  estimatedDays: number | null;
  contractValueCents: number | null;
  estMaterialCents: number | null;
  estTravelCents: number | null;
  estLaborCents: number | null;
  actualLaborCents: number | null;
  actualMaterialCents: number | null;
  actualTravelCents: number | null;
  estHours: number | null;
  actualHours: number | null;
  estLaborers: number | null;
  estSupervisors: number | null;
  computedLaborCents: number;
  computedMaterialCents: number;
  materialEntries: CoMaterialRow[];
  laborers: { id: string; employeeId: string | null; name: string; role: string | null; workDate: string; hours: number; regHours: number; otHours: number; hourlyRateCents: number; taskDescription: string | null; qualityRating: string | null; qualityNotes: string | null; completed: boolean }[];
};

export type EmployeeOption = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  status: string;
  hourlyPayCents: number | null;
  role: string | null;
};

function LaborerMultiSelect({
  employees,
  selectedIds,
  onChange,
}: {
  employees: EmployeeOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = employees.filter((e) =>
    `${e.firstName} ${e.lastName}`.toLowerCase().includes(query.toLowerCase()),
  );

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  function remove(id: string) {
    onChange(selectedIds.filter((x) => x !== id));
  }

  const selectedEmployees = employees.filter((e) => selectedIds.includes(e.id));

  return (
    <div ref={containerRef} className="relative mt-1">
      <div
        className="min-h-[38px] w-full cursor-text rounded-md border border-gray-300 bg-white px-2 py-1.5 focus-within:border-pink-500 focus-within:ring-1 focus-within:ring-pink-500"
        onClick={() => setOpen(true)}
      >
        <div className="flex flex-wrap gap-1.5">
          {selectedEmployees.map((e) => {
            const name = `${e.firstName} ${e.lastName}`.trim();
            return (
              <span
                key={e.id}
                className="flex items-center gap-1 rounded bg-pink-100 px-2 py-0.5 text-xs font-medium text-pink-800"
              >
                {name}
                <button
                  type="button"
                  onMouseDown={(ev) => { ev.stopPropagation(); remove(e.id); }}
                  className="ml-0.5 text-pink-500 hover:text-pink-700"
                  aria-label={`Remove ${name}`}
                >
                  ×
                </button>
              </span>
            );
          })}
          <input
            type="text"
            className="min-w-[120px] flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
            placeholder={selectedIds.length === 0 ? "Search laborers…" : ""}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
          />
        </div>
      </div>
      {open && (
        <ul className="absolute z-10 mt-1 max-h-52 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-400">No results</li>
          ) : (
            filtered.map((e) => {
              const name = `${e.firstName} ${e.lastName}`.trim();
              const selected = selectedIds.includes(e.id);
              return (
                <li
                  key={e.id}
                  onMouseDown={(ev) => { ev.preventDefault(); toggle(e.id); setQuery(""); }}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-pink-50 ${selected ? "font-medium text-pink-700" : "text-gray-800"}`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? "border-pink-500 bg-pink-500 text-white" : "border-gray-300"}`}>
                    {selected && (
                      <svg viewBox="0 0 12 12" fill="currentColor" className="h-2.5 w-2.5">
                        <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  {name}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

function PmCombobox({
  employees,
  value,
  onChange,
}: {
  employees: EmployeeOption[];
  value: string;
  onChange: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const blurRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtered = query.trim()
    ? employees.filter((e) => `${e.firstName} ${e.lastName}`.toLowerCase().includes(query.toLowerCase()))
    : employees;

  return (
    <div className="relative mt-1">
      <input
        type="text"
        autoComplete="off"
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        placeholder="Search employees…"
        value={open ? query : value}
        onFocus={() => { setQuery(""); setOpen(true); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); if (value) onChange(""); }}
        onBlur={() => { blurRef.current = setTimeout(() => setOpen(false), 150); }}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg text-sm">
          {filtered.map((e) => {
            const name = `${e.firstName} ${e.lastName}`.trim();
            return (
              <li
                key={e.id}
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  if (blurRef.current) clearTimeout(blurRef.current);
                  onChange(name);
                  setQuery(name);
                  setOpen(false);
                }}
                className="cursor-pointer px-3 py-2 text-gray-900 hover:bg-pink-50 hover:text-pink-700"
              >
                {name}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ChangeOrderDetailEditor({
  projectId,
  projectTitle,
  data,
  employees,
  signingContent,
  isSupervisor,
  isEmployee,
  safetyChecks = [],
  safetyPassedKeys = [],
  hasApprovedCheckToday,
}: {
  projectId: string;
  projectTitle: string;
  data: ChangeOrderDetailData;
  employees: EmployeeOption[];
  signingContent?: React.ReactNode;
  isSupervisor?: boolean;
  isEmployee?: boolean;
  safetyChecks?: SafetyCheck[];
  safetyPassedKeys?: string[];
  hasApprovedCheckToday?: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState(data.title);
  const [status, setStatus] = useState<Status>(data.status);
  const [requestedDate, setRequestedDate] = useState(
    data.requestedDate ? data.requestedDate.slice(0, 10) : "",
  );
  const [startDate, setStartDate] = useState(
    data.startDate ? data.startDate.slice(0, 10) : "",
  );
  const [completedAt, setCompletedAt] = useState(
    data.completedAt ? data.completedAt.slice(0, 10) : "",
  );
  const [requestedBy, setRequestedBy] = useState(data.requestedBy || "");
  const [supervisor, setSupervisor] = useState(data.supervisor || "");
  const [comments, setComments] = useState(data.description || "");
  const [estimatedCost, setEstimatedCost] = useState(
    data.estimatedCostCents != null ? (data.estimatedCostCents / 100).toFixed(2) : "",
  );
  const [estimatedDays, setEstimatedDays] = useState(
    data.estimatedDays != null ? String(data.estimatedDays) : "",
  );
  const [contractValue, setContractValue] = useState(
    data.contractValueCents != null ? (data.contractValueCents / 100).toFixed(2) : "",
  );
  const [estMaterial, setEstMaterial] = useState(
    data.estMaterialCents != null ? (data.estMaterialCents / 100).toFixed(2) : "",
  );
  const [estTravel, setEstTravel] = useState(
    data.estTravelCents != null ? (data.estTravelCents / 100).toFixed(2) : "",
  );
  const [estLabor, setEstLabor] = useState(
    data.estLaborCents != null ? (data.estLaborCents / 100).toFixed(2) : "",
  );
  const [actualLabor, setActualLabor] = useState(
    data.actualLaborCents != null ? (data.actualLaborCents / 100).toFixed(2) : "",
  );
  const [actualMaterial, setActualMaterial] = useState(
    data.actualMaterialCents != null ? (data.actualMaterialCents / 100).toFixed(2) : "",
  );
  const [actualTravel, setActualTravel] = useState(
    data.actualTravelCents != null ? (data.actualTravelCents / 100).toFixed(2) : "",
  );
  const [estHours, setEstHours] = useState(data.estHours != null ? String(data.estHours) : "");
  const [actualHours, setActualHours] = useState(data.actualHours != null ? String(data.actualHours) : "");
  const [estLaborers, setEstLaborers] = useState(data.estLaborers != null ? String(data.estLaborers) : "");
  const [estSupervisors, setEstSupervisors] = useState(data.estSupervisors != null ? String(data.estSupervisors) : "");
  const actualLaborers = data.laborers.filter((l) => !l.role?.toLowerCase().includes("supervisor")).length;
  const actualSupervisors = data.laborers.filter((l) => l.role?.toLowerCase().includes("supervisor")).length;
  const [liveMaterialCents, setLiveMaterialCents] = useState(data.computedMaterialCents);
  const [notifyEmployeeIds, setNotifyEmployeeIds] = useState<string[]>([]);
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifyResult, setNotifyResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const notifiableEmployees = employees.filter((e) => e.email);

  async function handleSave() {
    if (!title.trim()) { setError("Title is required."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/change-orders/${data.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          status,
          requestedDate: requestedDate || null,
          startDate: startDate || null,
          completedAt: completedAt || null,
          requestedBy: requestedBy.trim() || null,
          supervisor: supervisor.trim() || null,
          description: comments.trim() || null,
          estimatedCost: estimatedCost.trim() || null,
          estimatedDays: estimatedDays.trim() || null,
          contractValue: contractValue.trim() || null,
          estMaterial: estMaterial.trim() || null,
          estTravel: estTravel.trim() || null,
          estLabor: estLabor.trim() || null,
          actualLabor: actualLabor.trim() || null,
          actualMaterial: actualMaterial.trim() || null,
          actualTravel: actualTravel.trim() || null,
          estHours: estHours.trim() || null,
          actualHours: actualHours.trim() || null,
          estLaborers: estLaborers.trim() || null,
          estSupervisors: estSupervisors.trim() || null,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) { setError(json.error || "Failed to save"); return; }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/change-orders/${data.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error || "Failed to delete");
        setDeleting(false);
        return;
      }
      router.push(`/erp/projects/${projectId}`);
    } catch {
      setError("Network error");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/erp/projects/${projectId}`}
            className="flex items-center gap-1 text-xs text-pink-600 hover:underline"
          >
            ← Project details
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
            <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_COLORS[status]}`}>
              {status}
            </span>
          </div>
          <div className="mt-1">
            <a
              href={`/erp/projects/${projectId}`}
              className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
            >
              {projectTitle}
            </a>
          </div>
        </div>
      </div>

      {isSupervisor ? (
        <ChangeOrderLaborersSection
          projectId={projectId}
          changeOrderId={data.id}
          initialLaborers={data.laborers}
          employees={employees}
          initialStatus={data.status}
          initialCompletedAt={data.completedAt}
          safetyPassedKeys={safetyPassedKeys}
          hasApprovedCheckToday={hasApprovedCheckToday}
        />
      ) : isEmployee ? (
        <ChangeOrderLaborersSection
          projectId={projectId}
          changeOrderId={data.id}
          initialLaborers={data.laborers}
          employees={employees}
          canEdit={false}
          showFinancials={false}
        />
      ) : (
      <DetailTabs tabs={[
        {
          label: "Details",
          content: (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className={label} htmlFor="co-title">Title *</label>
                  <input id="co-title" required className={input} value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div>
                  <label className={label} htmlFor="co-status">Status</label>
                  <select id="co-status" className={input} value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="co-requested-date">Requested date</label>
                  <input
                    id="co-requested-date"
                    type="date"
                    className={input}
                    value={requestedDate}
                    onChange={(e) => setRequestedDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className={label} htmlFor="co-start-date">
                    Start date
                    <span className="ml-1 text-gray-400 font-normal">(auto-set on first labor log)</span>
                  </label>
                  <input
                    id="co-start-date"
                    type="date"
                    className={input}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className={label} htmlFor="co-completed-at">
                    Completed date
                    <span className="ml-1 text-gray-400 font-normal">(auto-set on mark complete)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="co-completed-at"
                      type="date"
                      className={`${input} mt-0`}
                      value={completedAt}
                      onChange={(e) => setCompletedAt(e.target.value)}
                    />
                    {status !== "COMPLETED" && status !== "BILLING" && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={async () => {
                          const date = completedAt || new Date().toISOString().slice(0, 10);
                          setStatus("COMPLETED");
                          setCompletedAt(date);
                          setSaving(true);
                          setError("");
                          try {
                            const res = await fetch(`/api/erp/projects/${projectId}/change-orders/${data.id}`, {
                              method: "PATCH",
                              headers: { "content-type": "application/json" },
                              body: JSON.stringify({ status: "COMPLETED", completedAt: date }),
                            });
                            const json = (await res.json()) as { error?: string };
                            if (!res.ok) { setError(json.error || "Failed to save"); setStatus(data.status); return; }
                            router.refresh();
                          } catch {
                            setError("Network error");
                            setStatus(data.status);
                          } finally {
                            setSaving(false);
                          }
                        }}
                        className="shrink-0 rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {saving ? "Saving…" : "Mark complete"}
                      </button>
                    )}
                    {(status === "COMPLETED" || status === "BILLING") && (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        Complete ✓
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <label className={label} htmlFor="co-requested-by">Requested by</label>
                  <input id="co-requested-by" className={input} value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} />
                </div>
                <div>
                  <label className={label}>PM</label>
                  <PmCombobox employees={employees} value={supervisor} onChange={setSupervisor} />
                </div>
                <div>
                  <label className={label} htmlFor="co-est-cost">Estimated cost (USD)</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                    <input id="co-est-cost" type="number" min={0} step="0.01" inputMode="decimal" className={`${input} pl-7`} placeholder="1250.00" value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className={label} htmlFor="co-est-days">Schedule impact (days)</label>
                  <input id="co-est-days" type="number" min={0} step={1} className={input} value={estimatedDays} onChange={(e) => setEstimatedDays(e.target.value)} />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className={label} htmlFor="co-comments">Comments</label>
                  <textarea id="co-comments" rows={4} className={input} value={comments} onChange={(e) => setComments(e.target.value)} />
                </div>
              </div>

              {error ? <p className="mt-3 text-sm text-red-600" role="alert">{error}</p> : null}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSave}
                  className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
                {confirmDelete ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="text-sm text-gray-600">Delete this change order?</span>
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={handleDelete}
                      className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
                    >
                      {deleting ? "Deleting…" : "Yes, delete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            </>
          ),
        },
        {
          label: "Costs",
          content: (
            <>
              {/* Contract value — standalone at top */}
              <div className="mb-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Contract value (USD)</h3>
                <div className="mt-3 max-w-xs">
                  <label className={label} htmlFor="co-contract-value">Contract value</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                    <input id="co-contract-value" type="number" min={0} step="0.01" inputMode="decimal" className={`${input} pl-7`} placeholder="0.00" value={contractValue} onChange={(e) => setContractValue(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Estimated vs Actual columns */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Estimated</h3>
                  <div className="space-y-3">
                    <div>
                      <label className={label} htmlFor="co-est-labor">Labor ($)</label>
                      <input id="co-est-labor" type="number" min={0} step="0.01" inputMode="decimal" className={input} placeholder="0.00" value={estLabor} onChange={(e) => setEstLabor(e.target.value)} />
                    </div>
                    <div>
                      <label className={label} htmlFor="co-est-material">Material ($)</label>
                      <input id="co-est-material" type="number" min={0} step="0.01" inputMode="decimal" className={input} placeholder="0.00" value={estMaterial} onChange={(e) => setEstMaterial(e.target.value)} />
                    </div>
                    <div>
                      <label className={label} htmlFor="co-est-travel">Travel ($)</label>
                      <input id="co-est-travel" type="number" min={0} step="0.01" inputMode="decimal" className={input} placeholder="0.00" value={estTravel} onChange={(e) => setEstTravel(e.target.value)} />
                    </div>
                    <div>
                      <label className={label} htmlFor="co-est-hours">Hours</label>
                      <input id="co-est-hours" type="number" min={0} step="0.5" className={input} placeholder="0" value={estHours} onChange={(e) => setEstHours(e.target.value)} />
                    </div>
                    <div>
                      <label className={label} htmlFor="co-est-laborers"># of laborers</label>
                      <input id="co-est-laborers" type="number" min={0} step={1} className={input} placeholder="0" value={estLaborers} onChange={(e) => setEstLaborers(e.target.value)} />
                    </div>
                    <div>
                      <label className={label} htmlFor="co-est-supervisors"># of supervisors</label>
                      <input id="co-est-supervisors" type="number" min={0} step={1} className={input} placeholder="0" value={estSupervisors} onChange={(e) => setEstSupervisors(e.target.value)} />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Actual</h3>
                  <div className="space-y-3">
                    <div>
                      <p className={label}>Labor ($)</p>
                      <p className="mt-1 rounded-md border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-800">
                        {centsToDollars(data.computedLaborCents)}
                        <span className="ml-2 text-xs text-gray-400">from laborers log</span>
                      </p>
                    </div>
                    <div>
                      <p className={label}>Material ($)</p>
                      <p className="mt-1 rounded-md border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-800">
                        {centsToDollars(liveMaterialCents)}
                        <span className="ml-2 text-xs text-gray-400">from materials log</span>
                      </p>
                    </div>
                    <div>
                      <label className={label} htmlFor="co-actual-travel">Travel ($)</label>
                      <input id="co-actual-travel" type="number" min={0} step="0.01" inputMode="decimal" className={input} placeholder="0.00" value={actualTravel} onChange={(e) => setActualTravel(e.target.value)} />
                    </div>
                    <div>
                      <label className={label} htmlFor="co-actual-hours">Hours</label>
                      <input id="co-actual-hours" type="number" min={0} step="0.5" className={input} placeholder="0" value={actualHours} onChange={(e) => setActualHours(e.target.value)} />
                    </div>
                    <div>
                      <p className={label}># of laborers</p>
                      <p className="mt-1 rounded-md border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-800">
                        {actualLaborers}
                        <span className="ml-2 text-xs text-gray-400">from laborers log</span>
                      </p>
                    </div>
                    <div>
                      <p className={label}># of supervisors</p>
                      <p className="mt-1 rounded-md border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-800">
                        {actualSupervisors}
                        <span className="ml-2 text-xs text-gray-400">from laborers log</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {error ? <p className="mt-3 text-sm text-red-600" role="alert">{error}</p> : null}

              <div className="mt-6">
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSave}
                  className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </>
          ),
        },
        {
          label: "Laborers",
          content: (
            <ChangeOrderLaborersSection
              projectId={projectId}
              changeOrderId={data.id}
              initialLaborers={data.laborers}
              employees={employees}
              initialStatus={data.status}
              initialCompletedAt={data.completedAt}
              safetyPassedKeys={safetyPassedKeys}
              hasApprovedCheckToday={hasApprovedCheckToday}
            />
          ),
        },
        {
          label: "Materials",
          content: (
            <ChangeOrderMaterialsSection
              projectId={projectId}
              changeOrderId={data.id}
              initialEntries={data.materialEntries}
              onTotalChange={setLiveMaterialCents}
            />
          ),
        },
        {
          label: "Safety Checklist",
          content: (
            <ProjectSafetySection
              projectId={projectId}
              initialChecks={safetyChecks}
              defaultSupervisorName=""
              employees={employees.map((e) => ({ id: e.id, firstName: e.firstName, lastName: e.lastName }))}
            />
          ),
        },
        ...(notifiableEmployees.length > 0
          ? [{
              label: "Notify",
              content: (
                <>
                  <LaborerMultiSelect
                    employees={notifiableEmployees}
                    selectedIds={notifyEmployeeIds}
                    onChange={(ids) => { setNotifyEmployeeIds(ids); setNotifyResult(null); }}
                  />
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={notifyEmployeeIds.length === 0 || notifyLoading}
                      onClick={async () => {
                        setNotifyLoading(true);
                        setNotifyResult(null);
                        try {
                          const res = await fetch(
                            `/api/erp/projects/${projectId}/change-orders/${data.id}/notify`,
                            {
                              method: "POST",
                              headers: { "content-type": "application/json" },
                              body: JSON.stringify({ employeeIds: notifyEmployeeIds }),
                            },
                          );
                          const json = (await res.json().catch(() => ({}))) as { ok?: boolean; sentTo?: string[]; error?: string };
                          if (res.ok) {
                            const sent = Array.isArray(json.sentTo) ? json.sentTo.join(", ") : (json.sentTo ?? "recipients");
                            setNotifyResult({ ok: true, msg: `Email sent to ${sent}` });
                            setNotifyEmployeeIds([]);
                          } else {
                            setNotifyResult({ ok: false, msg: json.error || "Failed to send email" });
                          }
                        } catch {
                          setNotifyResult({ ok: false, msg: "Network error" });
                        } finally {
                          setNotifyLoading(false);
                        }
                      }}
                      className="rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500 disabled:opacity-50"
                    >
                      {notifyLoading ? "Sending…" : "Send notification"}
                    </button>
                    {notifyResult && (
                      <span className={`text-xs ${notifyResult.ok ? "text-green-600" : "text-red-500"}`}>
                        {notifyResult.msg}
                      </span>
                    )}
                  </div>
                </>
              ),
            }]
          : []),
        ...(signingContent ? [{ label: "Signing", content: signingContent }] : []),
      ]} />
      )}
    </div>
  );
}
