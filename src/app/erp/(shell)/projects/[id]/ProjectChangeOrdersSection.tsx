"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { centsToDollars } from "@/lib/erp/money";
import { isNextDayStart, nextDayCountInRange } from "@/lib/nextDayUpcharge";
import { Button, inputClass, labelClass } from "@/app/erp/components/ui";
import { changeOrderDayCount, getChangeOrderLaborRates } from "@/lib/changeOrderLaborRates";
import { usePricingSettings } from "@/app/components/PricingSettingsProvider";
import { ChangeOrderLaborEstimator } from "./ChangeOrderLaborEstimator";
import { LaborRateCardEditor } from "./LaborRateCardEditor";

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
  /** Why it was rejected or voided, who wrote it (email), and when (ISO). */
  statusNote?: string | null;
  statusNoteBy?: string | null;
  statusNoteAt?: string | null;
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
/** Statuses that need a written reason (the API enforces it too). */
const NOTE_STATUSES: ProjectChangeOrderRow["status"][] = ["REJECTED", "VOID"];

/** "Rejected Nov 12 by anna@sueep.com: Customer said no" style line under a rejected or voided change order. */
export function StatusNoteLine({ status, note, by, at }: { status: string; note?: string | null; by?: string | null; at?: string | null }) {
  if (!note || !NOTE_STATUSES.includes(status as ProjectChangeOrderRow["status"])) return null;
  const when = at ? new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
  const who = [status === "VOID" ? "Voided" : "Rejected", when, by ? `by ${by.split("@")[0]}` : null].filter(Boolean).join(" ");
  return (
    <p className={`rounded px-2 py-1 text-xs ${status === "VOID" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"}`}>
      <span className="font-medium">{who}:</span> {note}
    </p>
  );
}


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
   * back to the Settings page rate via getChangeOrderLaborRates. */
  laborRateCard?: unknown;
  /** Hides the Labor rates editor — same restriction as everywhere else
   * financials are gated from Employee. */
  isEmployee?: boolean;
  canEditPricing?: boolean;
}) {
  const router = useRouter();
  const { coPriceRates, coDayHours } = usePricingSettings();
  const laborRates = getChangeOrderLaborRates(laborRateCard, coPriceRates);
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
  // Planned date range + next day upcharge (see nextDayUpcharge.ts)
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [nextDayUpcharge, setNextDayUpcharge] = useState(false);
  const days = changeOrderDayCount(startDate, endDate);

  const defaultNotifyIds = useState(() => {
    const ids: string[] = [];
    for (const e of notifiableEmployees) {
      const name = `${e.firstName} ${e.lastName}`.toLowerCase();
      if (
        name === "david rodriguez" ||
        name === "jennifer cortes-loya" ||
        e.firstName.toLowerCase() === "sergio" ||
        e.firstName.toLowerCase() === "nick"
      ) {
        ids.push(e.id);
      }
    }
    return ids;
  })[0];

  const [notifyEmployeeIds, setNotifyEmployeeIds] = useState<string[]>(defaultNotifyIds);
  const [notifyResult, setNotifyResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError("");
    setNotifyResult(null);
    if (startDate && endDate && endDate < startDate) {
      setError("End date must be on or after the start date");
      return;
    }
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
          // flat day per person (Settings, Pricing), times the days in the range.
          estHours: String(coDayHours * days),
          estimatedDays: startDate ? days : undefined,
          contractValue: contractValue.trim() || undefined,
          estLabor: estLabor.trim() || undefined,
          nextDayUpcharge,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
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
      setStartDate("");
      setEndDate("");
      setNextDayUpcharge(false);

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

  async function onSave(id: string, status: ProjectChangeOrderRow["status"], statusNote?: string) {
    setSavingId(id);
    setError("");
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/change-orders/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, ...(statusNote ? { statusNote } : {}) }),
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
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Start change order</h2>
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
              {STATUSES.filter((s) => !NOTE_STATUSES.includes(s)).map((status) => (
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
          <div>
            <label className={label} htmlFor="co-startDate">
              Start date
            </label>
            <input
              id="co-startDate"
              type="date"
              className={input}
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                // Ticks the upcharge for today or tomorrow, still untickable
                setNextDayUpcharge(isNextDayStart(e.target.value));
                if (endDate && e.target.value && endDate < e.target.value) setEndDate(e.target.value);
              }}
            />
          </div>
          <div>
            <label className={label} htmlFor="co-endDate">
              End date
            </label>
            <input id="co-endDate" type="date" className={input} value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
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
            days={days}
            nextDayUpcharge={nextDayUpcharge}
            nextDayDays={nextDayCountInRange(startDate, endDate)}
            onNextDayUpchargeChange={setNextDayUpcharge}
            autoFill
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
        <Button size="md" className="mt-4" type="submit"
          disabled={loading}>
          {loading ? "Saving..." : "Create change order"}
        </Button>
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
  onSave: (id: string, status: ProjectChangeOrderRow["status"], statusNote?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ProjectChangeOrderRow["status"]>(row.status);
  const [statusNote, setStatusNote] = useState("");
  const needsNote = NOTE_STATUSES.includes(status) && status !== row.status;

  useEffect(() => {
    setStatus(row.status);
    setStatusNote("");
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
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-gray-900" title={row.title}>{row.title}</span>
            {row.statusNote && NOTE_STATUSES.includes(row.status) ? (
              <span className="block truncate text-xs text-gray-500" title={row.statusNote}>
                {row.status === "VOID" ? "Voided" : "Rejected"}: {row.statusNote}
              </span>
            ) : null}
          </span>
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
            {needsNote ? (
              <div className="min-w-[16rem] flex-1">
                <label className={label} htmlFor={`co-status-note-${row.id}`}>
                  Why is it being {status === "VOID" ? "voided" : "rejected"}? *
                </label>
                <input
                  id={`co-status-note-${row.id}`}
                  className={input}
                  value={statusNote}
                  maxLength={1000}
                  autoFocus
                  placeholder={status === "VOID" ? "Entered twice, replaced by CO #12…" : "Customer declined the price…"}
                  onChange={(e) => setStatusNote(e.target.value)}
                />
              </div>
            ) : null}
            <button
              type="button"
              disabled={saving || status === row.status || (needsNote && !statusNote.trim())}
              onClick={() => onSave(row.id, status, needsNote ? statusNote.trim() : undefined)}
              className="rounded-md bg-pink-600 px-3 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>

          <StatusNoteLine status={row.status} note={row.statusNote} by={row.statusNoteBy} at={row.statusNoteAt} />

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