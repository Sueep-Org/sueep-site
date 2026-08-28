"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { centsToDollars } from "@/lib/erp/money";
import { inputClass, labelClass } from "@/app/erp/components/ui";
import { CHANGE_ORDER_ESTIMATE_DAY_HOURS, getChangeOrderLaborRates } from "@/lib/changeOrderLaborRates";
import { ChangeOrderLaborEstimator } from "./ChangeOrderLaborEstimator";
import { LaborRateCardEditor } from "./LaborRateCardEditor";

const ESTIMATOR_API = "https://ai-estimator-api-code-gaaaajezb3hfh9ex.eastus2-01.azurewebsites.net";

type EstimatorCrewMember = { role?: string; rate?: number; hours?: number; days?: number };
type EstimatorPhase = { persons?: number; days?: number; crew?: EstimatorCrewMember[] };
/** A single change order in the estimator's own crew-based model (public/estimator/simple-app.js,
 * _updateOneChangeOrderCalc / showChangeOrderCard), it carries its own crew and per-person rate,
 * not a re-billing of the base phases at separate rates (that older shape no longer appears in
 * real data). */
type EstimatorChangeOrder = {
  id?: string;
  name?: string;
  crew?: EstimatorCrewMember[];
  materials?: number;
  materials_gc?: number;
};
type EstimatorLaborBreakdown = {
  cleaner_rate?: number;
  foreman_rate?: number;
  phases?: EstimatorPhase[];
  /** Current shape, a project can carry several change orders. */
  change_orders?: EstimatorChangeOrder[];
  /** Legacy shape from before multi-CO support, always a single entry. */
  change_order?: EstimatorChangeOrder;
};

/** The change orders on an estimator project. Prefers the current plural shape, falling back to
 * wrapping the legacy singular change_order into a one-item list, the same migration the
 * estimator's own showChangeOrderCard runs (simple-app.js:3559-3569). */
function resolveEstimatorChangeOrders(lb: EstimatorLaborBreakdown): EstimatorChangeOrder[] {
  if (lb.change_orders && lb.change_orders.length > 0) return lb.change_orders;
  if (lb.change_order?.crew?.length) {
    return [{ ...lb.change_order, name: lb.change_order.name || "Change Order #1" }];
  }
  return [];
}

/** Mirrors the estimator's own per-phase labor cost math (public/estimator/simple-app.js,
 * _calcPhase) so a change order's cost lines match what the estimator would show, without
 * touching estimator code, this just reads its already-public output shape. */
function estimatorPhaseLaborCost(phase: EstimatorPhase, cleanerRate: number, foremanRate: number): number {
  const crew = phase.crew ?? [];
  if (crew.length > 0) {
    let cleanersPay = 0, foremanPay = 0, pmPay = 0;
    for (const m of crew) {
      if (m.role === "cleaner") cleanersPay += (m.rate ?? 0) * (m.hours ?? 8) * (m.days ?? 0);
      else if (m.role === "project_manager") pmPay += (m.rate ?? 0) * (m.days ?? 0);
      else foremanPay += (m.rate ?? 0) * (m.days ?? 0);
    }
    return cleanersPay + foremanPay + pmPay;
  }
  // Backward compat: old format with persons/days + global rates, same fallback as the estimator.
  return (phase.persons ?? 0) * (phase.days ?? 0) * cleanerRate * 8 + (phase.days ?? 0) * foremanRate;
}

/** A change order's own billed labor, mirrors the estimator's _updateOneChangeOrderCalc
 * (simple-app.js:3388-3410): each change order carries its own crew and per-person rate, it
 * isn't the base phases re-billed at change-order rates. */
function estimatorChangeOrderLabor(co: EstimatorChangeOrder): number {
  let billed = 0;
  for (const m of co.crew ?? []) {
    billed += (m.rate ?? 0) * (m.hours ?? 8) * (m.days ?? 0);
  }
  return billed;
}

type EmployeeNotifyOption = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
};

function NotifyMultiSelect({
  employees,
  selectedIds,
  onChange,
}: {
  employees: EmployeeNotifyOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const filtered = employees.filter((e) =>
    `${e.firstName} ${e.lastName}`.toLowerCase().includes(query.toLowerCase()),
  );

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  const selected = employees.filter((e) => selectedIds.includes(e.id));

  return (
    <div ref={containerRef} className="relative mt-1">
      <div
        className="min-h-[38px] w-full cursor-text rounded-md border border-gray-300 bg-white px-2 py-1.5 focus-within:border-pink-500 focus-within:ring-1 focus-within:ring-pink-500"
        onClick={() => setOpen(true)}
      >
        <div className="flex flex-wrap gap-1.5">
          {selected.map((e) => {
            const name = `${e.firstName} ${e.lastName}`.trim();
            return (
              <span key={e.id} className="flex items-center gap-1 rounded bg-pink-100 px-2 py-0.5 text-xs font-medium text-pink-800">
                {name}
                <button
                  type="button"
                  onMouseDown={(ev) => { ev.stopPropagation(); toggle(e.id); }}
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
            placeholder={selectedIds.length === 0 ? "Search employees…" : ""}
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
              const isSelected = selectedIds.includes(e.id);
              return (
                <li
                  key={e.id}
                  onMouseDown={(ev) => { ev.preventDefault(); toggle(e.id); setQuery(""); }}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-pink-50 ${isSelected ? "font-medium text-pink-700" : "text-gray-800"}`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${isSelected ? "border-pink-500 bg-pink-500 text-white" : "border-gray-300"}`}>
                    {isSelected && (
                      <svg viewBox="0 0 12 12" fill="currentColor" className="h-2.5 w-2.5">
                        <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span>{name}</span>
                  {e.email && <span className="ml-auto text-xs text-gray-400">{e.email}</span>}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

export type ChangeOrderLaborer = {
  id: string;
  employeeId: string | null;
  name: string;
  role: string | null;
};

export type ProjectChangeOrderRow = {
  id: string;
  createdAt: string;
  title: string;
  description: string | null;
  requestedBy: string | null;
  supervisor: string | null;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "VOID" | "BILLING" | "COMPLETED";
  estimatedCostCents: number | null;
  estimatedDays: number | null;
  reason: string | null;
  resolutionNotes: string | null;
  contractValueCents: number | null;
  estMaterialCents: number | null;
  estTravelCents: number | null;
  estLaborCents: number | null;
  actualLaborCents: number | null;
  actualMaterialCents: number | null;
  actualTravelCents: number | null;
  noCrewRequired: boolean;
  laborers: ChangeOrderLaborer[];
};


const STATUSES: ProjectChangeOrderRow["status"][] = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "VOID", "BILLING", "COMPLETED"];


const input = inputClass.md;
const label = labelClass.default;

export function ProjectChangeOrdersSection({
  projectId,
  initialEntries,
  employees = [],
  laborRateCard,
  isEmployee = false,
  canEditPricing = false,
}: {
  projectId: string;
  initialEntries: ProjectChangeOrderRow[];
  employees?: EmployeeNotifyOption[];
  /** This project's Labor rates override (see Project.laborRateCard) — falls
   * back to DEFAULT_CHANGE_ORDER_LABOR_RATES via getChangeOrderLaborRates. */
  laborRateCard?: unknown;
  /** Hides the Labor rates editor — same restriction as everywhere else
   * financials are gated from Employee. */
  isEmployee?: boolean;
  canEditPricing?: boolean;
}) {
  const router = useRouter();
  const laborRates = getChangeOrderLaborRates(laborRateCard);
  const [entries, setEntries] = useState(initialEntries);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const notifiableEmployees = employees.filter((e) => e.email);
  const [pmSupervisor, setPmSupervisor] = useState("");

  // "Pricing" block on the create form — see ChangeOrderLaborEstimator.
  const [estCleanerCount, setEstCleanerCount] = useState("");
  const [estSupervisorCount, setEstSupervisorCount] = useState("");
  const [estNoCrewRequired, setEstNoCrewRequired] = useState(false);
  const [contractValue, setContractValue] = useState("");
  const [estLabor, setEstLabor] = useState("");

  const defaultNotifyIds = useState(() => {
    const ids: string[] = [];
    for (const e of notifiableEmployees) {
      const name = `${e.firstName} ${e.lastName}`.toLowerCase();
      if (name === "david rodriguez" || e.firstName.toLowerCase() === "sergio" || e.firstName.toLowerCase() === "nick") {
        ids.push(e.id);
      }
    }
    return ids;
  })[0];

  const [notifyEmployeeIds, setNotifyEmployeeIds] = useState<string[]>(defaultNotifyIds);
  const [notifyResult, setNotifyResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Estimator import modal: step 1 picks an estimator project, step 2 picks
  // which of that project's change orders to bring in (a project can have
  // several, see resolveEstimatorChangeOrders above).
  const [estModalOpen, setEstModalOpen] = useState(false);
  const [estProjects, setEstProjects] = useState<{ id: string; name: string }[]>([]);
  const [estModalLoading, setEstModalLoading] = useState(false);
  const [estModalError, setEstModalError] = useState("");
  const [estCoOptions, setEstCoOptions] = useState<{ key: string; co: EstimatorChangeOrder; labor: number }[]>([]);
  const [estBaseLaborCost, setEstBaseLaborCost] = useState(0);
  const [estSelectedCoKeys, setEstSelectedCoKeys] = useState<Set<string>>(new Set());
  const [estImporting, setEstImporting] = useState(false);
  /** Non-null once a project's been picked, i.e. step 2 (the CO checklist) is showing. */
  const [estSelectedProjectName, setEstSelectedProjectName] = useState<string | null>(null);

  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  async function openEstimatorImport() {
    const anonId = localStorage.getItem("ai_estimator_anon_id");
    setEstCoOptions([]);
    setEstSelectedCoKeys(new Set());
    setEstSelectedProjectName(null);
    if (!anonId) {
      setEstModalError("Open the AI Estimator page at least once to link your account.");
      setEstModalOpen(true);
      return;
    }
    setEstModalOpen(true);
    setEstModalLoading(true);
    setEstModalError("");
    try {
      const res = await fetch(`${ESTIMATOR_API}/api/projects`, {
        headers: { "x-anon-id": anonId },
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load projects");
      const data = (await res.json()) as { projects?: { id: string; name: string }[] };
      setEstProjects(data.projects ?? []);
      if ((data.projects ?? []).length === 0) setEstModalError("No estimator projects found.");
    } catch {
      setEstModalError("Could not connect to the estimator. Try again.");
    } finally {
      setEstModalLoading(false);
    }
  }

  async function openEstimatorProjectChangeOrders(estId: string) {
    const anonId = localStorage.getItem("ai_estimator_anon_id")!;
    setEstModalLoading(true);
    setEstModalError("");
    try {
      const projRes = await fetch(`${ESTIMATOR_API}/api/projects/${estId}`, {
        headers: { "x-anon-id": anonId }, cache: "no-store",
      });
      if (!projRes.ok) throw new Error("Failed to load project");

      const proj = (await projRes.json()) as { labor_breakdown?: EstimatorLaborBreakdown };
      const lb = proj.labor_breakdown;
      if (!lb || !(lb.phases?.length)) {
        setEstModalError("That estimator project has no labor breakdown set up yet.");
        setEstModalLoading(false);
        return;
      }
      const cleanerRate = lb.cleaner_rate ?? 0;
      const foremanRate = lb.foreman_rate ?? 0;
      let laborCosts = 0;
      for (const phase of lb.phases ?? []) laborCosts += estimatorPhaseLaborCost(phase, cleanerRate, foremanRate);
      setEstBaseLaborCost(laborCosts);

      const changeOrders = resolveEstimatorChangeOrders(lb);
      const options = changeOrders.map((co, i) => ({
        key: co.id || `co-${i}`,
        co,
        labor: estimatorChangeOrderLabor(co),
      }));
      setEstCoOptions(options);
      setEstSelectedCoKeys(new Set(options.map((o) => o.key)));
      if (options.length === 0) {
        setEstModalError("No change orders in that estimator project yet.");
      }
    } catch {
      setEstModalError("Could not load that project. Try again.");
    } finally {
      setEstModalLoading(false);
    }
  }

  function toggleEstCo(key: string) {
    setEstSelectedCoKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function importSelectedChangeOrders() {
    const selected = estCoOptions.filter((o) => estSelectedCoKeys.has(o.key));
    if (selected.length === 0) return;
    setEstImporting(true);
    setEstModalError("");
    try {
      const results = await Promise.allSettled(
        selected.map(async ({ co, labor }) => {
          const res = await fetch(`/api/erp/projects/${projectId}/change-orders`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              title: co.name || "Change Order",
              status: "DRAFT",
              contractValue: labor,
              estLabor: estBaseLaborCost,
              estMaterial: co.materials ?? 0,
            }),
          });
          const data = (await res.json()) as ProjectChangeOrderRow & { error?: string };
          if (!res.ok) throw new Error(data.error || "Failed to create change order");
          return data;
        }),
      );
      const created = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      const failed = results.filter((r) => r.status === "rejected").length;
      if (created.length > 0) setEntries((prev) => [...created, ...prev]);
      if (failed > 0) {
        setEstModalError(`Imported ${created.length} of ${selected.length}, ${failed} failed. Try again for the rest.`);
      } else {
        setEstModalOpen(false);
      }
      if (created.length > 0) router.refresh();
    } finally {
      setEstImporting(false);
    }
  }

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError("");
    setNotifyResult(null);
    setLoading(true);
    const fd = new FormData(form);

    try {
      const res = await fetch(`/api/erp/projects/${projectId}/change-orders`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: String(fd.get("title") || "").trim(),
          requestedBy: String(fd.get("requestedBy") || "").trim() || undefined,
          supervisor: pmSupervisor.trim() || undefined,
          status: String(fd.get("status") || "DRAFT"),
          description: String(fd.get("description") || "").trim() || undefined,
          estLaborers: estCleanerCount.trim() || undefined,
          estSupervisors: estSupervisorCount.trim() || undefined,
          noCrewRequired: estNoCrewRequired,
          // No hours input anymore — every change order estimate assumes a
          // flat 8-hour day per person (see CHANGE_ORDER_ESTIMATE_DAY_HOURS).
          estHours: String(CHANGE_ORDER_ESTIMATE_DAY_HOURS),
          contractValue: contractValue.trim() || undefined,
          estLabor: estLabor.trim() || undefined,
        }),
      });
      const data = (await res.json()) as ProjectChangeOrderRow & { error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to create change order");
        setLoading(false);
        return;
      }
      setEntries((prev) => [data, ...prev]);
      form.reset();
      setPmSupervisor("");
      setEstCleanerCount("");
      setEstSupervisorCount("");
      setEstNoCrewRequired(false);
      setContractValue("");
      setEstLabor("");

      // Send notifications to selected employees
      if (notifyEmployeeIds.length > 0) {
        try {
          const notifyRes = await fetch(
            `/api/erp/projects/${projectId}/change-orders/${data.id}/notify`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ employeeIds: notifyEmployeeIds }),
            },
          );
          const notifyJson = (await notifyRes.json().catch(() => ({}))) as { ok?: boolean; sentTo?: string[]; error?: string };
          if (notifyRes.ok) {
            const names = notifyEmployeeIds
              .map((id) => {
                const emp = notifiableEmployees.find((e) => e.id === id);
                return emp ? `${emp.firstName} ${emp.lastName}`.trim() : null;
              })
              .filter(Boolean)
              .join(", ");
            setNotifyResult({ ok: true, msg: `Notified: ${names}` });
          } else {
            setNotifyResult({ ok: false, msg: notifyJson.error || "Created, but notification failed" });
          }
        } catch {
          setNotifyResult({ ok: false, msg: "Created, but notification failed" });
        }
      }

      // Reset notify selection back to defaults
      setNotifyEmployeeIds(defaultNotifyIds);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function onSave(id: string, status: ProjectChangeOrderRow["status"]) {
    setSavingId(id);
    setError("");
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/change-orders/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json()) as ProjectChangeOrderRow & { error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to update change order");
        setSavingId(null);
        return;
      }
      setEntries((prev) => prev.map((row) => (row.id === id ? data : row)));
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {estModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">
                {estSelectedProjectName ? `Change orders in ${estSelectedProjectName}` : "Import change orders from AI Estimator"}
              </h3>
              <button
                type="button"
                onClick={() => setEstModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {estSelectedProjectName === null ? (
              <>
                <p className="mb-3 text-xs text-gray-500">Select a project to see its change orders.</p>
                {estModalLoading ? (
                  <p className="py-4 text-center text-sm text-gray-400">Loading…</p>
                ) : estModalError ? (
                  <p className="text-xs text-red-500">{estModalError}</p>
                ) : (
                  <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200">
                    {estProjects.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setEstSelectedProjectName(p.name);
                            openEstimatorProjectChangeOrders(p.id);
                          }}
                          className="w-full px-3 py-2.5 text-left text-sm text-gray-800 hover:bg-yellow-50 hover:text-yellow-900"
                        >
                          {p.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                <p className="mb-3 text-xs text-gray-500">
                  Pick which change orders to bring in. Each pulls its own labor as the contract value, its materials cost, and the project&apos;s labor cost.
                </p>
                {estModalLoading ? (
                  <p className="py-4 text-center text-sm text-gray-400">Loading…</p>
                ) : (
                  <>
                    {estCoOptions.length > 0 ? (
                      <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-1.5">
                        {estCoOptions.map(({ key, co, labor }) => {
                          const checked = estSelectedCoKeys.has(key);
                          return (
                            <li key={key}>
                              <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-yellow-50">
                                <span className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleEstCo(key)}
                                    className="h-4 w-4 rounded border-gray-300 text-yellow-500 focus:ring-yellow-400"
                                  />
                                  <span className="text-gray-800">{co.name || "Change Order"}</span>
                                </span>
                                <span className="text-xs text-gray-400">${centsToDollars(Math.round(labor * 100))}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                    {estModalError ? <p className="mt-2 text-xs text-red-500">{estModalError}</p> : null}
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEstSelectedProjectName(null);
                          setEstCoOptions([]);
                          setEstModalError("");
                        }}
                        className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                      >
                        Back
                      </button>
                      {estCoOptions.length > 0 ? (
                        <button
                          type="button"
                          onClick={importSelectedChangeOrders}
                          disabled={estImporting || estSelectedCoKeys.size === 0}
                          className="flex-1 rounded-md bg-yellow-400 px-3 py-1.5 text-xs font-semibold text-yellow-900 hover:bg-yellow-300 disabled:opacity-50"
                        >
                          {estImporting ? "Importing…" : `Import ${estSelectedCoKeys.size || ""}`}
                        </button>
                      ) : null}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Change orders</h2>
        <div className="mt-4 space-y-3">
          {entries.length === 0 ? (
            <p className="rounded-md border border-dashed border-gray-300 p-4 text-sm text-gray-500">
              No change orders yet.
            </p>
          ) : (
            entries.map((entry) => (
              <ChangeOrderEditor
                key={entry.id}
                row={entry}
                projectId={projectId}
                saving={savingId === entry.id}
                onSave={onSave}
              />
            ))
          )}
        </div>
      </div>

      <form onSubmit={onAdd} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Start change order</h2>
          <button
            type="button"
            onClick={openEstimatorImport}
            className="rounded-md bg-yellow-400 px-3 py-1 text-xs font-semibold text-yellow-900 hover:bg-yellow-300 active:bg-yellow-500"
          >
            Import from Estimator
          </button>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2">
            <label className={label} htmlFor="co-title">
              Title *
            </label>
            <input id="co-title" name="title" required className={input} placeholder="Add two extra prep coats in lobby" />
          </div>
          <div>
            <label className={label} htmlFor="co-status">
              Status
            </label>
            <select id="co-status" name="status" defaultValue="DRAFT" className={input}>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>PM</label>
            <PmCombobox employees={employees} value={pmSupervisor} onChange={setPmSupervisor} />
          </div>
          <div>
            <label className={label} htmlFor="co-requestedBy">
              Requested by
            </label>
            <input id="co-requestedBy" name="requestedBy" className={input} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={label} htmlFor="co-description">
              Comments
            </label>
            <textarea id="co-description" name="description" rows={3} className={input} />
          </div>
        </div>
        <div className="mt-4">
          <ChangeOrderLaborEstimator
            pricingRates={laborRates}
            cleanerCount={estCleanerCount}
            onCleanerCountChange={setEstCleanerCount}
            supervisorCount={estSupervisorCount}
            onSupervisorCountChange={setEstSupervisorCount}
            noCrewRequired={estNoCrewRequired}
            onNoCrewRequiredChange={setEstNoCrewRequired}
            contractValue={contractValue}
            onContractValueChange={setContractValue}
            estLabor={estLabor}
            onEstLaborChange={setEstLabor}
            disabled={loading}
          />
        </div>
        {notifiableEmployees.length > 0 && (
          <div className="mt-4 border-t border-gray-200 pt-4">
            <label className="block text-xs font-medium text-gray-600">Notify employees</label>
            <NotifyMultiSelect
              employees={notifiableEmployees}
              selectedIds={notifyEmployeeIds}
              onChange={(ids) => { setNotifyEmployeeIds(ids); setNotifyResult(null); }}
            />
          </div>
        )}
        {error ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        {notifyResult && (
          <p className={`mt-2 text-xs ${notifyResult.ok ? "text-green-600" : "text-red-500"}`} role="status">
            {notifyResult.msg}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="mt-4 rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Create change order"}
        </button>
      </form>

      {!isEmployee ? (
        <div className="max-w-xl">
          <LaborRateCardEditor projectId={projectId} initialRateCard={laborRateCard} canEdit={canEditPricing} />
        </div>
      ) : null}
    </div>
  );
}

function PmCombobox({
  employees,
  value,
  onChange,
}: {
  employees: EmployeeNotifyOption[];
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
    <div className="relative">
      <input
        type="text"
        autoComplete="off"
        className={input}
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

const STATUS_COLORS: Record<ProjectChangeOrderRow["status"], string> = {
  DRAFT: "bg-gray-200 text-gray-700",
  SUBMITTED: "bg-blue-100 text-blue-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  VOID: "bg-amber-100 text-amber-700",
  BILLING: "bg-emerald-100 text-emerald-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
};

function ChangeOrderEditor({
  row,
  projectId,
  saving,
  onSave,
}: {
  row: ProjectChangeOrderRow;
  projectId: string;
  saving: boolean;
  onSave: (id: string, status: ProjectChangeOrderRow["status"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ProjectChangeOrderRow["status"]>(row.status);

  useEffect(() => {
    setStatus(row.status);
  }, [row.status]);

  return (
    <div className="rounded-md border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_COLORS[row.status]}`}>
            {row.status}
          </span>
          {row.noCrewRequired ? (
            <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500" title="No crew required">
              No crew
            </span>
          ) : null}
          <span className="truncate text-sm font-medium text-gray-900" title={row.title}>{row.title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <span className="text-xs text-gray-500">
            {centsToDollars(row.estimatedCostCents)} &middot; {row.estimatedDays ?? 0}d
          </span>
          <Link
            href={`/erp/projects/${projectId}/change-orders/${row.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs font-medium text-pink-600 hover:underline"
          >
            View details
          </Link>
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-200 px-4 pb-4 pt-3 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className={label} htmlFor={`co-status-${row.id}`}>Status</label>
              <select
                id={`co-status-${row.id}`}
                className={input}
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectChangeOrderRow["status"])}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={saving || status === row.status}
              onClick={() => onSave(row.id, status)}
              className="rounded-md bg-pink-600 px-3 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>

          {/* Cost breakdown */}
          <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
            {row.contractValueCents != null && (
              <div className="mb-3 flex justify-between text-xs">
                <span className="font-medium text-gray-500 uppercase tracking-wide">Contract value</span>
                <span className="font-semibold text-gray-800">{centsToDollars(row.contractValueCents)}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Estimated</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Actual</p>
              {[
                { label: "Labor", est: row.estLaborCents, act: row.actualLaborCents },
                { label: "Material", est: row.estMaterialCents, act: row.actualMaterialCents },
                { label: "Travel", est: row.estTravelCents, act: row.actualTravelCents },
              ].map(({ label: rowLabel, est, act }) => (
                <React.Fragment key={rowLabel}>
                  <div className="flex justify-between text-xs py-0.5">
                    <span className="text-gray-500">{rowLabel}</span>
                    <span className="text-gray-800">{centsToDollars(est)}</span>
                  </div>
                  <div className="flex justify-between text-xs py-0.5">
                    <span className="text-gray-500">{rowLabel}</span>
                    <span className="text-gray-800">{centsToDollars(act)}</span>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}