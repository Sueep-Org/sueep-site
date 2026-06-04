"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { centsToDollars } from "@/lib/erp/money";
import { deriveProjectLifecycle } from "@/lib/erp/projectLifecycle";
import { projectSegmentLabel } from "@/lib/erp/projectSegments";

type LaborRowBase = {
  id: string;
  updatePath: string;
  date: string;
  role: string | null;
  name: string;
  hours: number;
  hourlyRateCents: number;
  description: string | null;
  qualityRating: string | null;
  qualityNotes: string | null;
};

export type UnitQualityCheckRow = {
  id: string;
  createdAt: string;
  unitNumber: string | null;
  supervisorName: string;
  pmApproval: boolean;
  evidencePhotoCount: number;
  notes: string | null;
};

export type ProjectTableRow = {
  id: string;
  jobTitle: string;
  description: string | null;
  segment: string;
  status: string;
  projectDate: string | null;
  supervisor: string | null;
  percentDone: number;
  percentInvoiced: number;
  billingStatus: string | null;
  contractValueCents: number | null;
  laborEntries: LaborRowBase[];
  materialEntries: { date: string; category: string; itemName: string; quantity: number | null; unit: string | null; costCents: number; notes: string | null }[];
  totalHours: number;
  laborCents: number;
  materialCents: number;
  estMaterialCents: number | null;
  actualMaterialCents: number;
  estLaborCents: number | null;
  actualLaborCents: number;
  estHours: number | null;
  actualHours: number;
  cleaningCents: number;
  paintCents: number;
  miles: number;
  hubspotPipelineId: string | null;
  unitQualityChecks: UnitQualityCheckRow[];
  changeOrders: {
    id: string;
    title: string;
    status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "VOID" | "BILLING";
    billingStatus: string | null;
    percentInvoiced: number;
    estimatedCostCents: number | null;
    estimatedDays: number | null;
    requestedBy: string | null;
    supervisor: string | null;
    description: string | null;
    laborers: LaborRowBase[];
    laborCostCents: number;
  }[];
};

export const CO_STATUS_COLORS: Record<"DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "VOID" | "BILLING", string> = {
  DRAFT: "bg-gray-200 text-gray-600",
  SUBMITTED: "bg-blue-100 text-blue-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-600",
  VOID: "bg-gray-100 text-gray-500",
  BILLING: "bg-purple-100 text-purple-700",
};

export function projectStateClasses(state: "COMPLETED" | "ACTIVE" | "UPCOMING"): { row: string; detail: string; sticky: string; titleLink: string } {
  if (state === "COMPLETED") return { row: "bg-white hover:bg-gray-50", detail: "bg-gray-50", sticky: "bg-white", titleLink: "text-gray-500 hover:underline" };
  if (state === "UPCOMING") return { row: "bg-white hover:bg-gray-50", detail: "bg-gray-50", sticky: "bg-white", titleLink: "text-purple-600 hover:underline" };
  return { row: "bg-white hover:bg-gray-50", detail: "bg-gray-50", sticky: "bg-white", titleLink: "text-emerald-600 hover:underline" };
}

type LaborRow = LaborRowBase;

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
}

export function EmptyValue() {
  return <span className="text-gray-400">-</span>;
}

function getDetailLine(description: string | null, label: string) {
  const prefix = `${label}:`;
  return (
    (description || "")
      .split(/\r?\n/)
      .find((line) => line.trim().toLowerCase().startsWith(prefix.toLowerCase()))
      ?.replace(new RegExp(`^${label}:\\s*`, "i"), "")
      .trim() || ""
  );
}

export function TurnoverPricingSummary({
  project,
  showPropertyTitle = true,
  showUnitsSummary = true,
}: {
  project: ProjectTableRow;
  showPropertyTitle?: boolean;
  showUnitsSummary?: boolean;
}) {
  const property = getDetailLine(project.description, "Property");
  const units = getDetailLine(project.description, "Units");
  const total = getDetailLine(project.description, "Estimated Turnover Total");
  const standardBreakdown = getDetailLine(project.description, "Pricing Breakdown");
  const specialPackage = getDetailLine(project.description, "Special Pricing Package");
  const breakdownLines = standardBreakdown ? standardBreakdown.split(/\s+\|\s+/).filter(Boolean) : [];

  return (
    <div className="overflow-x-auto bg-white px-3 py-2">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Turnover pricing</p>
          {showPropertyTitle ? <p className="mt-1 text-sm font-semibold text-slate-900">{property || project.jobTitle}</p> : null}
          {showUnitsSummary && units ? <p className="mt-0.5 max-w-5xl text-xs text-slate-500">{units}</p> : null}
        </div>
        <div className="text-left sm:text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Total</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{total || centsToDollars(project.contractValueCents)}</p>
        </div>
      </div>

      {breakdownLines.length > 0 ? (
        <table className="w-full table-fixed text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              <th className="w-[24%] pb-1.5 pr-3 text-left font-semibold">Unit</th>
              <th className="w-[56%] pb-1.5 pr-3 text-left font-semibold">Pricing</th>
              <th className="w-[20%] pb-1.5 text-right font-semibold">Line Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {breakdownLines.map((line, index) => {
              const [unitPart, rest = ""] = line.split(": ");
              const totalMatch = rest.match(/=\s*([^=]+)$/);
              const lineTotal = totalMatch?.[1]?.trim() || "-";
              const pricing = totalMatch ? rest.replace(/\s*=\s*[^=]+$/, "").trim() : rest;

              return (
                <tr key={`${unitPart}-${index}`} className="text-slate-900">
                  <td className="py-1 pr-3 align-top font-medium">{unitPart || `Unit ${index + 1}`}</td>
                  <td className="py-1 pr-3 align-top text-slate-600">{pricing || line}</td>
                  <td className="py-1 text-right align-top font-medium tabular-nums">{lineTotal}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="border-t border-gray-100 pt-2 text-xs text-slate-500">
          No turnover pricing breakdown is saved on this project yet.
        </p>
      )}

      {specialPackage ? (
        <div className="mt-3 border-t border-gray-100 pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Special pricing package</p>
          <p className="mt-1 whitespace-pre-line text-xs text-slate-700">{specialPackage}</p>
        </div>
      ) : null}
    </div>
  );
}

function getTurnoverDropdownTitle(project: ProjectTableRow) {
  const units = getDetailLine(project.description, "Units") || getDetailLine(project.description, "Unit Numbers");

  if (units) {
    const scope = units.match(/\)\s*-\s*(.+)$/)?.[1]?.trim();
    if (scope) return scope;
  }

  return "Turnover";
}

function getBuildingTitle(project: ProjectTableRow) {
  return (
    getDetailLine(project.description, "Property") ||
    getDetailLine(project.description, "Building") ||
    project.jobTitle.split(" - ")[0]?.trim() ||
    "Unassigned building"
  );
}

function JanitorialTurnoverDetail({ project }: { project: ProjectTableRow }) {
  const units = getDetailLine(project.description, "Units") || getDetailLine(project.description, "Unit Numbers");
  const comments = getDetailLine(project.description, "Comments") || getDetailLine(project.description, "Notes");

  return (
    <>
      <div className="mb-2 overflow-x-auto rounded border border-gray-200 bg-white px-3 py-2">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Laborers</p>
        <LaborTable entries={project.laborEntries} />
      </div>

      <div className="mb-2 overflow-x-auto rounded border border-gray-200 bg-white">
        <TurnoverPricingSummary project={project} />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded border border-gray-200 bg-white px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Turnover scope</p>
          <p className="mt-1 text-xs text-gray-700 line-clamp-3">
            {comments || units || <span className="text-gray-400">No turnover notes</span>}
          </p>
        </div>

        <div className="rounded border border-gray-200 bg-white px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Cost / Schedule</p>
          <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
            <span className="text-gray-400">Contract</span>
            <span className="font-medium text-gray-800">{centsToDollars(project.contractValueCents)}</span>
            <span className="text-gray-400">Start</span>
            <span className="font-medium text-gray-800">{project.projectDate ? fmtDate(project.projectDate) : "-"}</span>
            <span className="text-gray-400">Est. hours</span>
            <span className="font-medium text-gray-800">{project.estHours ?? "-"}</span>
          </div>
        </div>

        <div className="flex flex-col rounded border border-gray-200 bg-white px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Supervisor</p>
          <p className="mt-1 text-sm font-semibold text-gray-800">{project.supervisor || "-"}</p>
          <Link
            href={`/erp/projects/${project.id}`}
            onClick={(e) => e.stopPropagation()}
            className="mt-auto pt-2 text-xs font-medium text-gray-600 hover:underline"
          >
            Full details {"->"}
          </Link>
        </div>
      </div>
    </>
  );
}

function SubRowTitleCell({
  badge,
  status,
  statusClass,
  href,
  title,
}: {
  badge: string;
  status: string;
  statusClass: string;
  href: string;
  title: string;
}) {
  return (
    <td className="w-[420px] min-w-[420px] bg-gray-50 px-3 py-1.5">
      <div className="flex items-center gap-2 pl-4">
        <span className="shrink-0 text-gray-300">&gt;</span>
        <span className="shrink-0 rounded bg-gray-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-600">
          {badge}
        </span>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${statusClass}`}>
          {status}
        </span>
        <Link
          href={href}
          onClick={(e) => e.stopPropagation()}
          className="truncate text-sm font-medium text-gray-700 hover:underline"
        >
          {title}
        </Link>
      </div>
    </td>
  );
}

const QUALITY_OPTIONS = [
  { value: "", label: "—", score: null },
  { value: "POOR", label: "Poor", score: 1 },
  { value: "FAIR", label: "Fair", score: 2 },
  { value: "GOOD", label: "Good", score: 3 },
  { value: "EXCELLENT", label: "Excellent", score: 4 },
];

const QUALITY_SCORE: Record<string, number> = {
  POOR: 1,
  FAIR: 2,
  GOOD: 3,
  EXCELLENT: 4,
};

const QUALITY_COLORS: Record<string, string> = {
  EXCELLENT: "text-emerald-600",
  GOOD: "text-gray-800",
  FAIR: "text-gray-500",
  POOR: "text-red-400",
};

export function LaborTable({ entries, initialVisible = 5 }: { entries: LaborRow[]; initialVisible?: number }) {
  const [showAll, setShowAll] = useState(false);
  const [qualityMap, setQualityMap] = useState<Record<string, string>>(() =>
    Object.fromEntries(entries.map((e) => [e.id, e.qualityRating ?? ""]))
  );
  const [notesMap, setNotesMap] = useState<Record<string, string>>(() =>
    Object.fromEntries(entries.map((e) => [e.id, e.qualityNotes ?? ""]))
  );
  const [popup, setPopup] = useState<{ id: string; updatePath: string; draft: string } | null>(null);

  if (!entries.length) return <p className="text-xs text-gray-400">No labor logged</p>;

  const visibleEntries = showAll ? entries : entries.slice(0, initialVisible);
  const hiddenCount = Math.max(entries.length - visibleEntries.length, 0);

  function handleQualityChange(entry: LaborRow, value: string) {
    setQualityMap((prev) => ({ ...prev, [entry.id]: value }));
    fetch(entry.updatePath, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qualityRating: value || null }),
    }).catch(() => {});
  }

  function handleNotesSave() {
    if (!popup) return;
    const { id, updatePath, draft } = popup;
    setNotesMap((prev) => ({ ...prev, [id]: draft }));
    setPopup(null);
    fetch(updatePath, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qualityNotes: draft || null }),
    }).catch(() => {});
  }

  return (
    <>
      <div>
        <table className="w-full table-fixed text-xs">
          <colgroup>
            <col className="w-[9%]" />
            <col className="w-[20%]" />
            <col className="w-[21%]" />
            <col className="w-[8%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[16%]" />
            <col className="w-[6%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-gray-200 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              <th className="pb-1.5 pr-3 text-left font-semibold">Date</th>
              <th className="pb-1.5 pr-3 text-left font-semibold">Job Title</th>
              <th className="pb-1.5 pr-3 text-left font-semibold">Name</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">Hours</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">Rate/hr</th>
              <th className="pb-1.5 pr-3 text-left font-semibold">Description</th>
              <th className="pb-1.5 pr-3 text-left font-semibold">Quality</th>
              <th className="pb-1.5 text-left font-semibold">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibleEntries.map((e, i) => {
              const quality = qualityMap[e.id] ?? "";
              const notes = notesMap[e.id] ?? "";
              return (
                <tr key={`${e.date}-${e.name}-${i}`} className="text-slate-900">
                  <td className="py-1 pr-3 tabular-nums whitespace-nowrap">{fmtDate(e.date)}</td>
                  <td className="py-1 pr-3 truncate">{e.role ?? <EmptyValue />}</td>
                  <td className="py-1 pr-3 truncate font-medium">{e.name}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{e.hours.toFixed(2)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums whitespace-nowrap">{centsToDollars(e.hourlyRateCents)}</td>
                  <td className="py-1 pr-3 truncate text-slate-500">{e.description ?? <EmptyValue />}</td>
                  <td className="py-1 pr-3">
                    <div className="flex items-center gap-1">
                      {quality ? (
                        <span className={`shrink-0 text-xs font-bold tabular-nums ${QUALITY_COLORS[quality] ?? "text-gray-400"}`}>
                          {QUALITY_SCORE[quality]}
                        </span>
                      ) : null}
                      <select
                        value={quality}
                        onChange={(ev) => { ev.stopPropagation(); handleQualityChange(e, ev.target.value); }}
                        onClick={(ev) => ev.stopPropagation()}
                        className={`w-full rounded border border-gray-200 bg-white px-1 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-gray-300 ${QUALITY_COLORS[quality] ?? "text-gray-400"}`}
                      >
                        {QUALITY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.score != null ? `${opt.score} – ${opt.label}` : opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="py-1">
                    <button
                      type="button"
                      onClick={(ev) => { ev.stopPropagation(); setPopup({ id: e.id, updatePath: e.updatePath, draft: notes }); }}
                      title={notes || "Add quality notes"}
                      className={`rounded p-0.5 transition-colors ${notes ? "text-pink-500 hover:text-pink-700" : "text-gray-300 hover:text-gray-500"}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                        <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.683 1.82a.75.75 0 0 0 .953.953l1.82-.683a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474ZM3.5 6.75c0-.966.784-1.75 1.75-1.75h1a.75.75 0 0 1 0 1.5h-1a.25.25 0 0 0-.25.25v5c0 .138.112.25.25.25h5a.25.25 0 0 0 .25-.25v-1a.75.75 0 0 1 1.5 0v1A1.75 1.75 0 0 1 10.25 13.5h-5A1.75 1.75 0 0 1 3.5 11.75v-5Z" />
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowAll(true); }}
            className="mt-2 text-xs font-medium text-pink-600 hover:text-pink-700 hover:underline"
          >
            Show {hiddenCount} more
          </button>
        ) : showAll && entries.length > initialVisible ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowAll(false); }}
            className="mt-2 text-xs font-medium text-pink-600 hover:text-pink-700 hover:underline"
          >
            Show fewer
          </button>
        ) : null}
      </div>

      {popup ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setPopup(null)}
        >
          <div
            className="w-80 rounded-xl bg-white p-5 shadow-2xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h3 className="mb-3 text-sm font-semibold text-gray-800">Quality Notes</h3>
            <textarea
              autoFocus
              rows={4}
              value={popup.draft}
              onChange={(ev) => setPopup((p) => p ? { ...p, draft: ev.target.value } : null)}
              placeholder="Add notes about work quality..."
              className="w-full resize-none rounded-lg border border-gray-200 p-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPopup(null)}
                className="rounded-lg px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleNotesSave}
                className="rounded-lg bg-[#E73C6E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-pink-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function billingBadge(status: string | null) {
  if (!status) return <EmptyValue />;
  const map: Record<string, { label: string; cls: string }> = {
    BILLING: { label: "Billing", cls: "bg-pink-100 text-pink-700" },
    INVOICE_PAID: { label: "Invoice Paid", cls: "bg-gray-200 text-gray-700" },
    INACTIVE: { label: "Inactive", cls: "bg-gray-100 text-gray-500" },
  };
  const opt = map[status];
  if (!opt) return <EmptyValue />;
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${opt.cls}`}>{opt.label}</span>;
}

function isJanitorialProject(row: ProjectTableRow, janitorialPipelineId: string | null) {
  return (
    row.segment === "JANITORIAL_TURNOVER_REQUESTS" ||
    Boolean(row.description?.match(/^(Property|Units|Estimated Turnover Total|Pricing Breakdown):/im)) ||
    (Boolean(janitorialPipelineId) && row.hubspotPipelineId === janitorialPipelineId)
  );
}

export function ProjectsExpandableTable({
  rows,
  janitorialPipelineId,
  janitorialDetailMode = "pricing",
  organizeByBuilding = false,
}: {
  rows: ProjectTableRow[];
  janitorialPipelineId: string | null;
  janitorialDetailMode?: "pricing" | "team";
  organizeByBuilding?: boolean;
}) {
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [openCoIds, setOpenCoIds] = useState<string[]>([]);
  const [openTurnoverIds, setOpenTurnoverIds] = useState<string[]>([]);
  const openSet = useMemo(() => new Set(openIds), [openIds]);
  const openCoSet = useMemo(() => new Set(openCoIds), [openCoIds]);
  const openTurnoverSet = useMemo(() => new Set(openTurnoverIds), [openTurnoverIds]);
  const displayRows = useMemo(() => {
    if (!organizeByBuilding) return rows;
    return [...rows].sort((a, b) => {
      const buildingDelta = getBuildingTitle(a).localeCompare(getBuildingTitle(b));
      return buildingDelta || a.jobTitle.localeCompare(b.jobTitle);
    });
  }, [organizeByBuilding, rows]);
  const buildingCounts = useMemo(() => {
    const counts = new Map<string, number>();
    displayRows.forEach((row) => {
      const building = getBuildingTitle(row);
      counts.set(building, (counts.get(building) || 0) + 1);
    });
    return counts;
  }, [displayRows]);

  function toggle(id: string) {
    setOpenIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleCo(coId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setOpenCoIds((prev) => (prev.includes(coId) ? prev.filter((x) => x !== coId) : [...prev, coId]));
  }

  function toggleTurnover(projectId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setOpenTurnoverIds((prev) => (prev.includes(projectId) ? prev.filter((x) => x !== projectId) : [...prev, projectId]));
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full min-w-[1600px] text-left text-sm">
        <thead className="border-b border-gray-300 text-xs uppercase">
          <tr className="bg-gray-200 text-gray-700">
            <th className="w-[420px] min-w-[420px] px-3 py-2 font-semibold">Job</th>
            <th className="w-[220px] min-w-[220px] px-3 py-2 font-semibold">PM</th>
            <th className="px-3 py-2 font-semibold">Segment</th>
            <th className="px-3 py-2 font-semibold">Contract</th>
            <th className="px-3 py-2 font-semibold">Est. Material</th>
            <th className="px-3 py-2 font-semibold">Act. Material</th>
            <th className="px-3 py-2 font-semibold">Est. Labor</th>
            <th className="px-3 py-2 font-semibold">Act. Labor</th>
            <th className="px-3 py-2 font-semibold">Est. Hours</th>
            <th className="px-3 py-2 font-semibold">Act. Hours</th>
            <th className="px-3 py-2 font-semibold">Progress</th>
            <th className="px-3 py-2 font-semibold">% Invoiced</th>
            <th className="px-3 py-2 font-semibold">Billing Status</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((p, i) => {
            const isOpen = openSet.has(p.id);
            const isJanitorialRow = janitorialDetailMode === "team" || isJanitorialProject(p, janitorialPipelineId);
            const showTurnoverDropdown = isJanitorialRow;
            const isTurnoverOpen = openTurnoverSet.has(p.id);
            const state = deriveProjectLifecycle(p.status, p.projectDate);
            const styles = projectStateClasses(state);
            const rowBg = i % 2 === 0 ? "bg-white hover:bg-gray-100" : "bg-gray-50 hover:bg-gray-100";
            const turnoverDropdownTitle = getTurnoverDropdownTitle(p);
            const buildingTitle = getBuildingTitle(p);
            const previousBuildingTitle = i > 0 ? getBuildingTitle(displayRows[i - 1]) : null;
            const showBuildingHeader = organizeByBuilding && buildingTitle !== previousBuildingTitle;
            return (
              <Fragment key={p.id}>
                {showBuildingHeader ? (
                  <tr className="border-t border-gray-300 bg-gray-100">
                    <td colSpan={10} className="px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">{buildingTitle}</p>
                        <span className="rounded bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                          {buildingCounts.get(buildingTitle) || 0} project{buildingCounts.get(buildingTitle) === 1 ? "" : "s"}
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : null}
                {/* Project row */}
                <tr
                  className={`${rowBg} cursor-pointer transition-colors`}
                  onClick={() => toggle(p.id)}
                  aria-expanded={isOpen}
                  title={isOpen ? "Collapse" : "Expand"}
                >
                  <td className="w-[420px] min-w-[420px] px-3 py-2">
                    <Link
                      href={`/erp/projects/${p.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className={`font-medium ${styles.titleLink}`}
                    >
                      {p.jobTitle}
                    </Link>
                    {p.description ? <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">{p.description}</p> : null}
                  </td>
                  <td className="w-[220px] min-w-[220px] px-3 py-2 text-gray-900">
                    {p.supervisor || <span className="text-gray-400">Unassigned</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-900">{projectSegmentLabel(p.segment)}</td>
                  <td className="px-3 py-2 text-gray-900">{centsToDollars(p.contractValueCents)}</td>
                  <td className="px-3 py-2 text-gray-900">{centsToDollars(p.estMaterialCents)}</td>
                  <td className="px-3 py-2 text-gray-900">{centsToDollars(p.actualMaterialCents)}</td>
                  <td className="px-3 py-2 text-gray-900">{centsToDollars(p.estLaborCents)}</td>
                  <td className="px-3 py-2 text-gray-900">{centsToDollars(p.actualLaborCents)}</td>
                  <td className="px-3 py-2 text-gray-900">{p.estHours ?? <span className="text-gray-400">-</span>}</td>
                  <td className="px-3 py-2 text-gray-900">{p.actualHours.toFixed(2)}</td>
                  <td className="px-3 py-2 text-gray-900">{p.percentDone}%</td>
                  <td className="px-3 py-2 text-gray-900">
                    {p.percentInvoiced > 0 ? `${p.percentInvoiced}%` : <span className="text-gray-400">-</span>}
                  </td>
                  <td className="px-3 py-2">{billingBadge(p.billingStatus)}</td>
                </tr>

                {isOpen ? (
                  <>
                    {/* Project detail */}
                    <tr className={styles.detail}>
                      <td colSpan={13} className="px-4 py-2 pb-3" onClick={(e) => e.stopPropagation()}>
                        {janitorialDetailMode === "pricing" && isJanitorialProject(p, janitorialPipelineId) ? (
                          <TurnoverPricingSummary project={p} />
                        ) : (
                          <div className="overflow-x-auto bg-white px-3 py-2">
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Team</p>
                            <LaborTable entries={p.laborEntries} />
                          </div>
                        )}
                      </td>
                    </tr>

                    {showTurnoverDropdown ? (
                      <>
                        <tr
                          className="cursor-pointer bg-gray-50 hover:bg-gray-100"
                          onClick={(e) => toggleTurnover(p.id, e)}
                          aria-expanded={isTurnoverOpen}
                        >
                          <SubRowTitleCell
                            badge="CO"
                            status="APPROVED"
                            statusClass={CO_STATUS_COLORS.APPROVED}
                            href={`/erp/projects/${p.id}`}
                            title={turnoverDropdownTitle}
                          />
                          <td className="w-[220px] min-w-[220px] px-3 py-1.5 text-sm text-gray-700">
                            {p.supervisor || <span className="text-gray-400">-</span>}
                          </td>
                          <td className="px-3 py-1.5 text-sm font-medium text-gray-500">
                            Turnover
                          </td>
                          <td className="px-3 py-1.5 text-sm tabular-nums text-gray-800">
                            {centsToDollars(p.contractValueCents)}
                          </td>
                          <td className="px-3 py-1.5 text-gray-400">-</td>
                          <td className="px-3 py-1.5 text-gray-400">-</td>
                          <td className="px-3 py-1.5 text-gray-400">-</td>
                          <td className="px-3 py-1.5 text-gray-400">-</td>
                          <td className="px-3 py-1.5 text-gray-400">-</td>
                          <td className="px-3 py-1.5 text-gray-400">-</td>
                          <td className="px-3 py-1.5 text-gray-900">{p.percentDone}%</td>
                          <td className="px-3 py-1.5 text-gray-900">
                            {p.percentInvoiced > 0 ? `${p.percentInvoiced}%` : <span className="text-gray-400">-</span>}
                          </td>
                          <td className="px-3 py-1.5">{billingBadge(p.billingStatus)}</td>
                        </tr>

                        {isTurnoverOpen ? (
                          <tr onClick={(e) => e.stopPropagation()}>
                            <td colSpan={13} className="bg-gray-50 px-6 py-2 pb-3">
                              <JanitorialTurnoverDetail project={p} />
                            </td>
                          </tr>
                        ) : null}
                      </>
                    ) : null}

                    {/* Change order rows - inline in the same table, same columns */}
                    {p.changeOrders.map((co) => {
                      const isCoOpen = openCoSet.has(co.id);
                      return (
                        <Fragment key={co.id}>
                          <tr
                            className="cursor-pointer bg-gray-50 hover:bg-gray-100"
                            onClick={(e) => toggleCo(co.id, e)}
                            aria-expanded={isCoOpen}
                          >
                            {/* Job -> CO title + status */}
                            <SubRowTitleCell
                              badge="CO"
                              status={co.status}
                              statusClass={CO_STATUS_COLORS[co.status]}
                              href={`/erp/projects/${p.id}/change-orders/${co.id}`}
                              title={co.title}
                            />
                            {/* PM -> Requested by */}
                            <td className="w-[220px] min-w-[220px] px-3 py-1.5 text-sm text-gray-700">
                              {co.requestedBy || <span className="text-gray-400">-</span>}
                            </td>
                            {/* Segment -> "Change Order" label */}
                            <td className="px-3 py-1.5 text-sm font-medium text-gray-500">
                              Change Order
                            </td>
                            {/* Contract -> Est. Cost */}
                            <td className="px-3 py-1.5 text-sm tabular-nums text-gray-800">
                              {centsToDollars(co.estimatedCostCents)}
                            </td>
                            {/* Material -> Schedule days */}
                            <td className="px-3 py-1.5 text-sm text-gray-700">
                              {co.estimatedDays != null
                                ? <>{co.estimatedDays}d</>
                                : <span className="text-gray-400">-</span>}
                            </td>
                            {/* Labor -> labor cost */}
                            <td className="px-3 py-1.5 text-sm tabular-nums text-gray-800">
                              {co.laborCostCents > 0
                                ? centsToDollars(co.laborCostCents)
                                : <span className="text-gray-400">-</span>}
                            </td>
                            {/* Hours, Progress - not applicable to COs */}
                            <td className="px-3 py-1.5 text-gray-400">-</td>
                            <td className="px-3 py-1.5 text-gray-400">-</td>
                            <td className="px-3 py-1.5 text-gray-400">-</td>
                            <td className="px-3 py-1.5 text-gray-400">-</td>
                            <td className="px-3 py-1.5 text-gray-900">
                              {co.percentInvoiced > 0 ? `${co.percentInvoiced}%` : <span className="text-gray-400">-</span>}
                            </td>
                            {/* Billing Status -> CO billing status */}
                            <td className="px-3 py-1.5">{billingBadge(co.billingStatus)}</td>
                          </tr>

                          {/* Expanded CO detail */}
                          {isCoOpen ? (
                            <tr onClick={(e) => e.stopPropagation()}>
                              <td colSpan={13} className="bg-gray-50 px-6 py-2 pb-3">
                                <div className="mb-2 overflow-x-auto rounded border border-gray-200 bg-white px-3 py-2">
                                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Laborers</p>
                                  <LaborTable entries={co.laborers} />
                                </div>
                                <div className="grid gap-2 sm:grid-cols-3">
                                  <div className="rounded border border-gray-200 bg-white px-3 py-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Comments</p>
                                    <p className="mt-1 text-xs text-gray-700 line-clamp-3">
                                      {co.description || <span className="text-gray-400">No comments</span>}
                                    </p>
                                  </div>

                                  <div className="rounded border border-gray-200 bg-white px-3 py-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Cost / Schedule</p>
                                    <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
                                      <span className="text-gray-400">Est. cost</span>
                                      <span className="font-medium text-gray-800">{centsToDollars(co.estimatedCostCents)}</span>
                                      <span className="text-gray-400">Schedule</span>
                                      <span className="font-medium text-gray-800">
                                        {co.estimatedDays != null ? `${co.estimatedDays} day${co.estimatedDays !== 1 ? "s" : ""}` : "-"}
                                      </span>
                                      <span className="text-gray-400">Requested by</span>
                                      <span className="font-medium text-gray-800">{co.requestedBy || "-"}</span>
                                    </div>
                                  </div>

                                  <div className="flex flex-col rounded border border-gray-200 bg-white px-3 py-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Supervisor</p>
                                    <p className="mt-1 text-sm font-semibold text-gray-800">{co.supervisor || "-"}</p>
                                    <Link
                                      href={`/erp/projects/${p.id}/change-orders/${co.id}`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="mt-auto pt-2 text-xs font-medium text-gray-600 hover:underline"
                                    >
                                      Full details {"->"}
                                    </Link>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}

                  </>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
