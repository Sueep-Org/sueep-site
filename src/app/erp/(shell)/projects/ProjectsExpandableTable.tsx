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
  buildingId?: string | null;
  buildingName?: string | null;
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
    contractValueCents: number | null;
    estMaterialCents: number | null;
    estTravelCents: number | null;
    estLaborCents: number | null;
    actualLaborCents: number | null;
    actualMaterialCents: number | null;
    actualTravelCents: number | null;
    estHours: number | null;
    actualHours: number | null;
    laborers: LaborRowBase[];
    laborCostCents: number;
    materialCostCents: number;
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

function projectActualCostCents(project: ProjectTableRow) {
  return (project.actualLaborCents ?? 0) + (project.actualMaterialCents ?? 0);
}

function projectMarginCents(project: ProjectTableRow) {
  if (project.contractValueCents == null) return null;
  return project.contractValueCents - projectActualCostCents(project);
}

function marginClass(value: number | null) {
  if (value == null) return "text-gray-400";
  if (value < 0) return "text-red-600";
  return "text-emerald-700";
}

function marginPercent(project: ProjectTableRow) {
  const margin = projectMarginCents(project);
  if (margin == null || !project.contractValueCents) return null;
  return `${Math.round((margin / project.contractValueCents) * 100)}%`;
}

function sumProjects(rows: ProjectTableRow[], selector: (row: ProjectTableRow) => number | null | undefined) {
  return rows.reduce((sum, row) => sum + (selector(row) ?? 0), 0);
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

function getJanitorialBuildingName(project: ProjectTableRow) {
  return getDetailLine(project.description, "Property") || project.jobTitle.split(/\s+-\s+Unit\b/i)[0]?.trim() || project.jobTitle;
}

function JanitorialProjectDropdownDetail({ project }: { project: ProjectTableRow }) {
  const building = getJanitorialBuildingName(project);
  const address = getDetailLine(project.description, "Address");
  const units = getDetailLine(project.description, "Units") || getDetailLine(project.description, "Unit Numbers");
  const buildingHref = project.buildingId ? `/erp/buildings/${project.buildingId}?from=projects` : null;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto bg-white px-3 py-2">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Building</p>
        {buildingHref ? (
          <Link href={buildingHref} className="font-medium text-emerald-600 hover:underline">
            {building}
          </Link>
        ) : (
          <span className="font-medium text-gray-900">{building}</span>
        )}
        {address ? <p className="mt-1 text-xs text-gray-500">{address}</p> : null}
        {units ? (
          <Link href={`/erp/projects/${project.id}`} className="mt-2 block text-xs text-emerald-600 hover:underline">
            <span className="font-semibold text-gray-500">Units: </span>
            {units}
          </Link>
        ) : null}
      </div>
      <div className="overflow-x-auto bg-white px-3 py-2">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Team</p>
        <LaborTable entries={project.laborEntries} />
      </div>
    </div>
  );
}

function ProjectLaborLogPanel({ project, className = "overflow-x-auto bg-white px-3 py-2" }: { project: ProjectTableRow; className?: string }) {
  const cost = projectActualCostCents(project);
  const margin = projectMarginCents(project);
  const marginLabel = margin == null ? "-" : centsToDollars(margin);
  const marginPct = marginPercent(project);

  return (
    <div className={className}>
      <div className="mb-3 grid gap-2 sm:grid-cols-4">
        <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Charged</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{centsToDollars(project.contractValueCents)}</p>
        </div>
        <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Hours worked</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{project.actualHours.toFixed(2)}</p>
        </div>
        <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Actual cost</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{centsToDollars(cost)}</p>
        </div>
        <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Margin</p>
          <p className={`mt-1 text-sm font-semibold ${marginClass(margin)}`}>
            {marginLabel}{marginPct ? ` (${marginPct})` : ""}
          </p>
        </div>
      </div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Laborers log</p>
      <LaborTable entries={project.laborEntries} />
    </div>
  );
}

function SubRowTitleCell({
  badge,
  status,
  statusClass,
  href,
  title,
}: {
  badge?: string;
  status: string;
  statusClass: string;
  href: string;
  title: string;
}) {
  return (
    <td className="w-[420px] min-w-[420px] bg-gray-50 px-3 py-1.5">
      <div className="flex items-center gap-2 pl-4">
        <span className="shrink-0 text-gray-300">&gt;</span>
        {badge ? (
          <span className="shrink-0 rounded bg-gray-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-600">
            {badge}
          </span>
        ) : null}
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
    row.segment === "JANITORIAL_GENERAL_WORK_REQUEST" ||
    Boolean(row.description?.match(/^(Property|Units|Estimated Turnover Total|Pricing Breakdown):/im)) ||
    (Boolean(janitorialPipelineId) && row.hubspotPipelineId === janitorialPipelineId)
  );
}

export function ProjectsExpandableTable({
  rows,
  janitorialPipelineId,
  janitorialDetailMode = "pricing",
  groupTitleForRow,
  groupHrefForRow,
  collapsibleGroups = false,
  groupsDefaultOpen = false,
  rowTitleForRow,
  rowDescriptionForRow,
}: {
  rows: ProjectTableRow[];
  janitorialPipelineId: string | null;
  janitorialDetailMode?: "pricing" | "team";
  groupTitleForRow?: (row: ProjectTableRow, index: number, rows: ProjectTableRow[]) => string | null;
  groupHrefForRow?: (row: ProjectTableRow, index: number, rows: ProjectTableRow[]) => string | null;
  collapsibleGroups?: boolean;
  groupsDefaultOpen?: boolean;
  rowTitleForRow?: (row: ProjectTableRow) => string;
  rowDescriptionForRow?: (row: ProjectTableRow) => string | null;
}) {
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [openCoIds, setOpenCoIds] = useState<string[]>([]);
  const [openGroupTitles, setOpenGroupTitles] = useState<string[]>([]);
  const openSet = useMemo(() => new Set(openIds), [openIds]);
  const openCoSet = useMemo(() => new Set(openCoIds), [openCoIds]);
  const openGroupSet = useMemo(() => new Set(openGroupTitles), [openGroupTitles]);

  function toggle(id: string) {
    setOpenIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleCo(coId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setOpenCoIds((prev) => (prev.includes(coId) ? prev.filter((x) => x !== coId) : [...prev, coId]));
  }

  function toggleGroup(title: string) {
    setOpenGroupTitles((prev) => (prev.includes(title) ? prev.filter((x) => x !== title) : [...prev, title]));
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full min-w-[1820px] text-left text-sm">
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
            <th className="px-3 py-2 font-semibold">Act. Cost</th>
            <th className="px-3 py-2 font-semibold">Margin</th>
            <th className="px-3 py-2 font-semibold">Progress</th>
            <th className="px-3 py-2 font-semibold">% Invoiced</th>
            <th className="px-3 py-2 font-semibold">Billing Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const currentGroupTitle = groupTitleForRow?.(p, i, rows) || null;
            const previousGroupTitle = i > 0 ? groupTitleForRow?.(rows[i - 1], i - 1, rows) || null : null;
            const groupTitle = currentGroupTitle !== previousGroupTitle ? currentGroupTitle : null;
            const groupIsOpen = currentGroupTitle
              ? groupsDefaultOpen
                ? !openGroupSet.has(currentGroupTitle)
                : openGroupSet.has(currentGroupTitle)
              : true;
            const rowIsVisible = !collapsibleGroups || !currentGroupTitle || groupIsOpen;
            const groupRows = groupTitle ? rows.filter((row, index) => groupTitleForRow?.(row, index, rows) === groupTitle) : [];
            const groupCount = groupTitle
              ? groupRows.length
              : 0;
            const groupContract = groupTitle ? sumProjects(groupRows, (row) => row.contractValueCents) : 0;
            const groupActualLabor = groupTitle ? sumProjects(groupRows, (row) => row.actualLaborCents) : 0;
            const groupActualMaterial = groupTitle ? sumProjects(groupRows, (row) => row.actualMaterialCents) : 0;
            const groupActualHours = groupTitle ? sumProjects(groupRows, (row) => row.actualHours) : 0;
            const groupActualCost = groupActualLabor + groupActualMaterial;
            const groupMargin = groupTitle && groupRows.some((row) => row.contractValueCents != null) ? groupContract - groupActualCost : null;
            const isOpen = openSet.has(p.id);
            const state = deriveProjectLifecycle(p.status, p.projectDate);
            const styles = projectStateClasses(state);
            const rowBg = i % 2 === 0 ? "bg-white hover:bg-gray-100" : "bg-gray-50 hover:bg-gray-100";
            const rowTitle = rowTitleForRow?.(p) ?? p.jobTitle;
            const rowDescription = rowDescriptionForRow ? rowDescriptionForRow(p) : p.description;
            const groupHref = groupTitle ? groupHrefForRow?.(p, i, rows) || null : null;
            const actualCost = projectActualCostCents(p);
            const margin = projectMarginCents(p);
            const marginPct = marginPercent(p);
            return (
              <Fragment key={p.id}>
                {groupTitle ? (
                  <tr
                    className={`border-y border-gray-200 bg-gray-100 ${collapsibleGroups ? "cursor-pointer hover:bg-gray-200" : ""}`}
                    onClick={() => {
                      if (collapsibleGroups) toggleGroup(groupTitle);
                    }}
                    aria-expanded={collapsibleGroups ? groupIsOpen : undefined}
                  >
                    <td className="w-[420px] min-w-[420px] px-3 py-2">
                      {groupHref ? (
                        <Link
                          href={groupHref}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-emerald-600 hover:underline"
                        >
                          {groupTitle}
                        </Link>
                      ) : (
                        <span className="font-medium text-emerald-600">
                          {groupTitle}
                        </span>
                      )}
                      <p className="mt-0.5 text-xs text-gray-500">
                        {groupCount} unit{groupCount !== 1 ? "s" : ""}
                      </p>
                    </td>
                    <td className="w-[220px] min-w-[220px] px-3 py-2 text-gray-400">
                      -
                    </td>
                    <td className="px-3 py-2 text-gray-900">
                      Building
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-900">{centsToDollars(groupContract)}</td>
                    <td className="px-3 py-2 text-gray-400">-</td>
                    <td className="px-3 py-2 text-gray-900">{centsToDollars(groupActualMaterial)}</td>
                    <td className="px-3 py-2 text-gray-400">-</td>
                    <td className="px-3 py-2 text-gray-900">{centsToDollars(groupActualLabor)}</td>
                    <td className="px-3 py-2 text-gray-400">-</td>
                    <td className="px-3 py-2 text-gray-900">{groupActualHours.toFixed(2)}</td>
                    <td className="px-3 py-2 text-gray-900">{centsToDollars(groupActualCost)}</td>
                    <td className={`px-3 py-2 font-medium ${marginClass(groupMargin)}`}>
                      {groupMargin == null ? "-" : centsToDollars(groupMargin)}
                    </td>
                    {Array.from({ length: 2 }).map((_, emptyIndex) => (
                      <td
                        key={emptyIndex}
                        className="px-3 py-2 text-gray-400"
                      >
                        -
                      </td>
                    ))}
                    <td className="px-3 py-2 text-gray-400">
                      {collapsibleGroups ? (
                        <svg
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className={`h-4 w-4 transition-transform ${groupIsOpen ? "rotate-180" : ""}`}
                        >
                          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                        </svg>
                      ) : "-"}
                    </td>
                  </tr>
                ) : null}
                {rowIsVisible ? (
                  <>
                {/* Project row */}
                <tr
                  className={`${rowBg} cursor-pointer transition-colors`}
                  onClick={() => toggle(p.id)}
                  aria-expanded={isOpen}
                  title={isOpen ? "Collapse" : "Expand"}
                >
                  <td className="w-[420px] min-w-[420px] px-3 py-2">
                    <div className={`flex items-center gap-1.5 ${currentGroupTitle ? "pl-4" : ""}`}>
                      {currentGroupTitle && (
                        <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 shrink-0 text-gray-400">
                          <path d="M3 2 L3 10 Q3 13 6 13 L11 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M9 11 L12 13 L9 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                      <div className="min-w-0">
                        <Link
                          href={`/erp/projects/${p.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className={`font-medium ${styles.titleLink}`}
                        >
                          {rowTitle}
                        </Link>
                        {rowDescription ? <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">{rowDescription}</p> : null}
                      </div>
                    </div>
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
                  <td className="px-3 py-2 text-gray-900">{centsToDollars(actualCost)}</td>
                  <td className={`px-3 py-2 font-medium ${marginClass(margin)}`}>
                    {margin == null ? <span className="text-gray-400">-</span> : centsToDollars(margin)}
                    {marginPct ? <span className="ml-1 text-xs font-normal text-gray-500">({marginPct})</span> : null}
                  </td>
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
                      <td colSpan={15} className="px-4 py-2 pb-3" onClick={(e) => e.stopPropagation()}>
                        {janitorialDetailMode === "pricing" && isJanitorialProject(p, janitorialPipelineId) ? (
                          <ProjectLaborLogPanel project={p} />
                        ) : janitorialDetailMode === "team" ? (
                          <JanitorialProjectDropdownDetail project={p} />
                        ) : (
                          <ProjectLaborLogPanel project={p} />
                        )}
                      </td>
                    </tr>

                    {/* Change order rows - inline in the same table, same columns */}
                    {p.changeOrders.map((co) => {
                      const isCoOpen = openCoSet.has(co.id);
                      const coActualLabor = co.laborCostCents > 0 ? co.laborCostCents : (co.actualLaborCents ?? 0);
                      const coActualMaterial = co.materialCostCents > 0 ? co.materialCostCents : (co.actualMaterialCents ?? 0);
                      const coActualCost = coActualLabor + coActualMaterial;
                      const coMargin = co.contractValueCents == null ? null : co.contractValueCents - coActualCost;
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
                            {/* Contract -> contract value */}
                            <td className="px-3 py-1.5 text-sm tabular-nums text-gray-800">
                              {centsToDollars(co.contractValueCents)}
                            </td>
                            {/* Est. Material */}
                            <td className="px-3 py-1.5 text-sm tabular-nums text-gray-800">
                              {centsToDollars(co.estMaterialCents)}
                            </td>
                            {/* Act. Material — from materials log */}
                            <td className="px-3 py-1.5 text-sm tabular-nums text-gray-800">
                              {centsToDollars(co.materialCostCents > 0 ? co.materialCostCents : co.actualMaterialCents)}
                            </td>
                            {/* Est. Labor */}
                            <td className="px-3 py-1.5 text-sm tabular-nums text-gray-800">
                              {centsToDollars(co.estLaborCents)}
                            </td>
                            {/* Act. Labor — from laborers log */}
                            <td className="px-3 py-1.5 text-sm tabular-nums text-gray-800">
                              {centsToDollars(co.laborCostCents > 0 ? co.laborCostCents : co.actualLaborCents)}
                            </td>
                            {/* Est. Hours */}
                            <td className="px-3 py-1.5 text-sm tabular-nums text-gray-800">
                              {co.estHours != null ? co.estHours : <span className="text-gray-400">-</span>}
                            </td>
                            {/* Act. Hours */}
                            <td className="px-3 py-1.5 text-sm tabular-nums text-gray-800">
                              {co.actualHours != null ? co.actualHours : <span className="text-gray-400">-</span>}
                            </td>
                            <td className="px-3 py-1.5 text-sm tabular-nums text-gray-800">
                              {centsToDollars(coActualCost)}
                            </td>
                            <td className={`px-3 py-1.5 text-sm font-medium tabular-nums ${marginClass(coMargin)}`}>
                              {coMargin == null ? <span className="text-gray-400">-</span> : centsToDollars(coMargin)}
                            </td>
                            <td className="px-3 py-1.5 text-gray-900">
                              {co.percentInvoiced > 0 ? `${co.percentInvoiced}%` : <span className="text-gray-400">-</span>}
                            </td>
                            {/* Billing Status -> CO billing status */}
                            <td className="px-3 py-1.5">{billingBadge(co.billingStatus)}</td>
                          </tr>

                          {/* Expanded CO detail */}
                          {isCoOpen ? (
                            <tr onClick={(e) => e.stopPropagation()}>
                              <td colSpan={15} className="bg-gray-50 px-6 py-2 pb-3">
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
                                      <span className="text-gray-400">Contract</span>
                                      <span className="font-medium text-gray-800">{centsToDollars(co.contractValueCents)}</span>
                                      <span className="text-gray-400">Est. cost</span>
                                      <span className="font-medium text-gray-800">{centsToDollars(co.estimatedCostCents)}</span>
                                      <span className="text-gray-400">Schedule</span>
                                      <span className="font-medium text-gray-800">
                                        {co.estimatedDays != null ? `${co.estimatedDays} day${co.estimatedDays !== 1 ? "s" : ""}` : "-"}
                                      </span>
                                      <span className="text-gray-400">Requested by</span>
                                      <span className="font-medium text-gray-800">{co.requestedBy || "-"}</span>
                                    </div>
                                    <div className="mt-2 grid grid-cols-2 gap-x-4 border-t border-gray-100 pt-2">
                                      <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Estimated</p>
                                        <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
                                          <span className="text-gray-400">Labor</span>
                                          <span className="font-medium text-gray-800">{centsToDollars(co.estLaborCents)}</span>
                                          <span className="text-gray-400">Material</span>
                                          <span className="font-medium text-gray-800">{centsToDollars(co.estMaterialCents)}</span>
                                          <span className="text-gray-400">Travel</span>
                                          <span className="font-medium text-gray-800">{centsToDollars(co.estTravelCents)}</span>
                                          <span className="text-gray-400">Hours</span>
                                          <span className="font-medium text-gray-800">{co.estHours ?? "-"}</span>
                                        </div>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Actual</p>
                                        <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
                                          <span className="text-gray-400">Labor</span>
                                          <span className="font-medium text-gray-800">{centsToDollars(co.laborCostCents > 0 ? co.laborCostCents : co.actualLaborCents)}</span>
                                          <span className="text-gray-400">Material</span>
                                          <span className="font-medium text-gray-800">{centsToDollars(co.materialCostCents > 0 ? co.materialCostCents : co.actualMaterialCents)}</span>
                                          <span className="text-gray-400">Travel</span>
                                          <span className="font-medium text-gray-800">{centsToDollars(co.actualTravelCents)}</span>
                                          <span className="text-gray-400">Hours</span>
                                          <span className="font-medium text-gray-800">{co.actualHours ?? "-"}</span>
                                        </div>
                                      </div>
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
