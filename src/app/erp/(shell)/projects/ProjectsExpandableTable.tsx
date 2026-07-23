"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { centsToDollars } from "@/lib/erp/money";
import { deriveProjectLifecycle, hasActiveChangeOrder } from "@/lib/erp/projectLifecycle";

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
  contractorEntries: {
    name: string;
    role: string | null;
    startDate: string | null;
    endDate: string | null;
    costCents: number | null;
    notes: string | null;
  }[];
  changeOrders: {
    id: string;
    title: string;
    status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "VOID" | "BILLING" | "COMPLETED";
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

export const CO_STATUS_COLORS: Record<"DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "VOID" | "BILLING" | "COMPLETED", string> = {
  DRAFT: "bg-gray-200 text-gray-600",
  SUBMITTED: "bg-blue-100 text-blue-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-600",
  VOID: "bg-gray-100 text-gray-500",
  BILLING: "bg-purple-100 text-purple-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
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

function getDescriptionLine(description: string | null, label: string) {
  const prefix = `${label}:`;
  return (
    (description || "")
      .split(/\r?\n/)
      .find((line) => line.trim().toLowerCase().startsWith(prefix.toLowerCase()))
      ?.replace(new RegExp(`^${label}:\\s*`, "i"), "")
      .trim() || null
  );
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

/** Flags a negative margin right at the name, so it can't be scanned past —
 * a project actively losing money shouldn't look the same as a healthy one
 * until you happen to notice the margin column. */
function MarginWarningIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className="mr-1 inline h-3.5 w-3.5 shrink-0 align-text-bottom text-red-500"
      aria-label="Negative margin"
    >
      <path
        fillRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.169 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function sumProjects(rows: ProjectTableRow[], selector: (row: ProjectTableRow) => number | null | undefined) {
  return rows.reduce((sum, row) => sum + (selector(row) ?? 0), 0);
}

/** Job/building titles and PM names are often "Name - extra detail - company"
 * (e.g. "The Gio Apartments - 2630 W Girard Ave... - Cushman & Wakefield") —
 * in these narrow columns, cut at the first " - " separator rather than
 * letting CSS ellipsis chop it mid-word wherever it happens to overflow.
 * Requires spaces around the hyphen so it doesn't false-match a hyphen
 * that's actually part of the name itself, like a street range ("20-30 W
 * Allens Ln") or a unit range ("2000-2039"). Only shortens text that
 * actually has a " - " to cut at; anything else is left for the `truncate`
 * class to ellipsis normally. */
function truncateAtHyphen(text: string): string {
  const idx = text.indexOf(" - ");
  if (idx === -1) return text;
  const before = text.slice(0, idx).trim();
  return before || text;
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

function JanitorialProjectDropdownDetail({ project, showFinancials = true }: { project: ProjectTableRow; showFinancials?: boolean }) {
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
        <LaborTable entries={project.laborEntries} showFinancials={showFinancials} />
      </div>
    </div>
  );
}

function ProjectLaborLogPanel({ project, className = "overflow-x-auto bg-white px-3 py-2", showFinancials = true }: { project: ProjectTableRow; className?: string; showFinancials?: boolean }) {
  return (
    <div className={className}>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Labor log</p>
      <LaborTable entries={project.laborEntries} showFinancials={showFinancials} />
      {project.contractorEntries.length > 0 && (
        <>
          <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Contractors</p>
          <table className="w-full table-fixed text-xs">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[20%]" />
              <col className="w-[20%]" />
              <col className="w-[16%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-gray-200 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                <th className="pb-1.5 pr-3 text-left font-semibold">Name</th>
                <th className="pb-1.5 pr-3 text-left font-semibold">Role</th>
                <th className="pb-1.5 pr-3 text-left font-semibold">Start</th>
                <th className="pb-1.5 pr-3 text-left font-semibold">End</th>
                <th className="pb-1.5 pr-3 text-right font-semibold">Cost</th>
                <th className="pb-1.5 text-left font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {project.contractorEntries.map((c, i) => (
                <tr key={i} className="text-slate-900">
                  <td className="py-1 pr-3 truncate font-medium">{c.name}</td>
                  <td className="py-1 pr-3 truncate">{c.role ?? "Contractor"}</td>
                  <td className="py-1 pr-3 tabular-nums whitespace-nowrap">{c.startDate ? fmtDate(c.startDate) : <EmptyValue />}</td>
                  <td className="py-1 pr-3 tabular-nums whitespace-nowrap">{c.endDate ? fmtDate(c.endDate) : <EmptyValue />}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{c.costCents != null ? centsToDollars(c.costCents) : <EmptyValue />}</td>
                  <td className="py-1 truncate text-slate-500">{c.notes ?? <EmptyValue />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
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
    <td className="w-[280px] min-w-[280px] bg-gray-50 px-3 py-1.5">
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
          title={title}
        >
          {truncateAtHyphen(title)}
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

export function LaborTable({ entries, initialVisible = 5, showFinancials = true }: { entries: LaborRow[]; initialVisible?: number; showFinancials?: boolean }) {
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
            <col className={showFinancials ? "w-[21%]" : "w-[31%]"} />
            <col className="w-[8%]" />
            {showFinancials && <col className="w-[10%]" />}
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
              {showFinancials && <th className="pb-1.5 pr-3 text-right font-semibold">Rate/hr</th>}
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
                  {showFinancials && <td className="py-1 pr-3 text-right tabular-nums whitespace-nowrap">{centsToDollars(e.hourlyRateCents)}</td>}
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
  canSeeFinancials = true,
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
  canSeeFinancials?: boolean;
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
  // Financial columns: Contract, Act Cost, Margin, Est/Act Labor, Est/Act Material (7 columns)
  const colCount = canSeeFinancials ? 14 : 7;

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
    <div className="overflow-auto rounded-lg border border-gray-200 max-h-[calc(100vh-8rem)]">
      <table className={`w-full text-left text-sm ${canSeeFinancials ? "min-w-[1600px]" : "min-w-[820px]"}`}>
        <thead className="sticky top-0 z-10 border-b border-gray-300 text-xs uppercase">
          <tr className="bg-gray-200 text-gray-700">
            <th className="w-[280px] min-w-[280px] px-3 py-2 font-semibold">Job</th>
            <th className="w-[130px] min-w-[130px] px-3 py-2 font-semibold">PM</th>
            {canSeeFinancials && (
              <th className="px-3 py-2 font-semibold" title="Base contract value plus non-void/rejected change orders">
                Contract
              </th>
            )}
            {canSeeFinancials && <th className="px-3 py-2 font-semibold">Act. Cost</th>}
            {canSeeFinancials && <th className="px-3 py-2 font-semibold">Margin</th>}
            {canSeeFinancials && <th className="px-3 py-2 font-semibold">Est. Labor</th>}
            {canSeeFinancials && <th className="px-3 py-2 font-semibold">Act. Labor</th>}
            {canSeeFinancials && <th className="px-3 py-2 font-semibold">Est. Material</th>}
            {canSeeFinancials && <th className="px-3 py-2 font-semibold">Act. Material</th>}
            <th className="px-3 py-2 font-semibold">Est. Hours</th>
            <th className="px-3 py-2 font-semibold">Act. Hours</th>
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
            const groupEstLabor = groupTitle ? sumProjects(groupRows, (row) => row.estLaborCents) : 0;
            const groupActualLabor = groupTitle ? sumProjects(groupRows, (row) => row.actualLaborCents) : 0;
            const groupActualMaterial = groupTitle ? sumProjects(groupRows, (row) => row.actualMaterialCents) : 0;
            const groupActualHours = groupTitle ? sumProjects(groupRows, (row) => row.actualHours) : 0;
            const groupActualCost = groupActualLabor + groupActualMaterial;
            const groupMargin = groupTitle && groupRows.some((row) => row.contractValueCents != null) ? groupContract - groupActualCost : null;
            const groupMarginPct = groupMargin != null && groupContract ? `${Math.round((groupMargin / groupContract) * 100)}%` : null;
            const isOpen = openSet.has(p.id);
            const state = deriveProjectLifecycle(p.status, p.projectDate, hasActiveChangeOrder(p.changeOrders));
            const styles = projectStateClasses(state);
            const rowBg = i % 2 === 0 ? "bg-white hover:bg-gray-100" : "bg-gray-50 hover:bg-gray-100";
            const rowTitle = rowTitleForRow?.(p) ?? p.jobTitle;
            // Only the raw jobTitle fallback needs hyphen-truncation (it's the
            // long "Name - detail - company" string). A custom rowTitleForRow
            // (e.g. janitorial unit labels like "BLDG 1 - Unit 405") is already
            // a short, deliberately-formatted label — truncating it at its own
            // internal hyphen would wrongly cut off the unit number.
            const displayRowTitle = rowTitleForRow ? rowTitle : truncateAtHyphen(rowTitle);
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
                    <td className="w-[280px] min-w-[280px] px-3 py-2">
                      {groupActualCost !== 0 && groupMargin != null && groupMargin < 0 ? <MarginWarningIcon /> : null}
                      {groupHref ? (
                        <Link
                          href={groupHref}
                          onClick={(e) => e.stopPropagation()}
                          className="block truncate font-medium text-emerald-600 hover:underline"
                          title={groupTitle}
                        >
                          {truncateAtHyphen(groupTitle)}
                        </Link>
                      ) : (
                        <span className="block truncate font-medium text-emerald-600" title={groupTitle}>
                          {truncateAtHyphen(groupTitle)}
                        </span>
                      )}
                      <p className="mt-0.5 text-xs text-gray-500">
                        {groupCount} unit{groupCount !== 1 ? "s" : ""}
                      </p>
                    </td>
                    <td className="w-[130px] min-w-[130px] px-3 py-2 text-gray-400">
                      -
                    </td>
                    {canSeeFinancials && <td className="px-3 py-2 font-medium text-gray-900">{centsToDollars(groupContract)}</td>}
                    {canSeeFinancials && <td className="px-3 py-2 text-gray-900">{centsToDollars(groupActualCost)}</td>}
                    {canSeeFinancials && (
                      <td className={`px-3 py-2 font-medium ${groupActualCost === 0 ? "text-gray-400" : marginClass(groupMargin)}`}>
                        {groupActualCost === 0 || groupMargin == null ? (
                          "-"
                        ) : (
                          <>
                            {centsToDollars(groupMargin)}
                            {groupMarginPct ? <span className="ml-1 text-xs font-normal text-gray-500">({groupMarginPct})</span> : null}
                          </>
                        )}
                      </td>
                    )}
                    {canSeeFinancials && <td className="px-3 py-2 text-gray-900">{centsToDollars(groupEstLabor)}</td>}
                    {canSeeFinancials && <td className="px-3 py-2 text-gray-900">{centsToDollars(groupActualLabor)}</td>}
                    {canSeeFinancials && <td className="px-3 py-2 text-gray-400">-</td>}
                    {canSeeFinancials && <td className="px-3 py-2 text-gray-900">{centsToDollars(groupActualMaterial)}</td>}
                    <td className="px-3 py-2 text-gray-400">-</td>
                    <td className="px-3 py-2 text-gray-900">{groupActualHours.toFixed(2)}</td>
                    <td className="px-3 py-2 text-gray-400">-</td>
                    <td className="px-3 py-2 text-gray-400">-</td>
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
                  <td className="w-[280px] min-w-[280px] px-3 py-2">
                    <div className={`flex items-center gap-1.5 ${currentGroupTitle ? "pl-4" : ""}`}>
                      {currentGroupTitle && (
                        <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 shrink-0 text-gray-400">
                          <path d="M3 2 L3 10 Q3 13 6 13 L11 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M9 11 L12 13 L9 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                      {actualCost !== 0 && margin != null && margin < 0 ? <MarginWarningIcon /> : null}
                      <div className="min-w-0">
                        <Link
                          href={`/erp/projects/${p.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className={`block truncate font-medium ${styles.titleLink}`}
                          title={rowTitle}
                        >
                          {displayRowTitle}
                        </Link>
                        {rowDescription ? <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">{rowDescription}</p> : null}
                      </div>
                    </div>
                  </td>
                  <td className="w-[130px] min-w-[130px] px-3 py-2 text-gray-900">
                    {(() => {
                      const isTurnover = p.segment === "JANITORIAL_TURNOVER_REQUESTS";
                      const sueepPm = isTurnover ? (p.supervisor || getDescriptionLine(p.description, "SUEEP PM")) : p.supervisor;
                      const pm = isTurnover ? getDescriptionLine(p.description, "Property Manager/Maintenance Manager") : null;
                      return (
                        <>
                          {sueepPm ? (
                            <span className="block truncate" title={sueepPm}>{truncateAtHyphen(sueepPm)}</span>
                          ) : (
                            <span className="text-gray-400">Unassigned</span>
                          )}
                          {pm ? <p className="truncate text-xs text-gray-500" title={pm}>{truncateAtHyphen(pm)}</p> : null}
                        </>
                      );
                    })()}
                  </td>
                  {canSeeFinancials && <td className="px-3 py-2 text-gray-900">{centsToDollars(p.contractValueCents)}</td>}
                  {canSeeFinancials && <td className="px-3 py-2 text-gray-900">{centsToDollars(actualCost)}</td>}
                  {canSeeFinancials && (
                    <td className={`px-3 py-2 font-medium ${actualCost === 0 ? "text-gray-400" : marginClass(margin)}`}>
                      {actualCost === 0 || margin == null ? (
                        <span className="text-gray-400">-</span>
                      ) : (
                        <>
                          {centsToDollars(margin)}
                          {marginPct ? <span className="ml-1 text-xs font-normal text-gray-500">({marginPct})</span> : null}
                        </>
                      )}
                    </td>
                  )}
                  {canSeeFinancials && <td className="px-3 py-2 text-gray-900">{centsToDollars(p.estLaborCents)}</td>}
                  {canSeeFinancials && <td className="px-3 py-2 text-gray-900">{centsToDollars(p.actualLaborCents)}</td>}
                  {canSeeFinancials && <td className="px-3 py-2 text-gray-900">{centsToDollars(p.estMaterialCents)}</td>}
                  {canSeeFinancials && <td className="px-3 py-2 text-gray-900">{centsToDollars(p.actualMaterialCents)}</td>}
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
                      <td colSpan={colCount} className="px-4 py-2 pb-3" onClick={(e) => e.stopPropagation()}>
                        {janitorialDetailMode === "pricing" && isJanitorialProject(p, janitorialPipelineId) ? (
                          <ProjectLaborLogPanel project={p} showFinancials={canSeeFinancials} />
                        ) : janitorialDetailMode === "team" ? (
                          <JanitorialProjectDropdownDetail project={p} showFinancials={canSeeFinancials} />
                        ) : (
                          <ProjectLaborLogPanel project={p} showFinancials={canSeeFinancials} />
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
                      const coMarginPercent =
                        coMargin != null && co.contractValueCents
                          ? `${Math.round((coMargin / co.contractValueCents) * 100)}%`
                          : null;
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
                            {/* PM */}
                            <td className="w-[130px] min-w-[130px] truncate px-3 py-1.5 text-sm text-gray-700" title={co.supervisor ?? undefined}>
                              {co.supervisor ? truncateAtHyphen(co.supervisor) : <span className="text-gray-400">-</span>}
                            </td>
                            {/* Contract -> contract value */}
                            {canSeeFinancials && (
                              <td className="px-3 py-1.5 text-sm tabular-nums text-gray-800">
                                {centsToDollars(co.contractValueCents)}
                              </td>
                            )}
                            {canSeeFinancials && (
                              <td className="px-3 py-1.5 text-sm tabular-nums text-gray-800">
                                {centsToDollars(coActualCost)}
                              </td>
                            )}
                            {canSeeFinancials && (
                              <td className={`px-3 py-1.5 text-sm font-medium tabular-nums ${coActualCost === 0 ? "text-gray-400" : marginClass(coMargin)}`}>
                                {coActualCost === 0 || coMargin == null ? (
                                  <span className="text-gray-400">-</span>
                                ) : (
                                  <>
                                    {centsToDollars(coMargin)}
                                    {coMarginPercent ? (
                                      <span className="ml-1 text-xs font-normal text-gray-500">({coMarginPercent})</span>
                                    ) : null}
                                  </>
                                )}
                              </td>
                            )}
                            {/* Est. Labor */}
                            {canSeeFinancials && (
                              <td className="px-3 py-1.5 text-sm tabular-nums text-gray-800">
                                {centsToDollars(co.estLaborCents)}
                              </td>
                            )}
                            {/* Act. Labor — from laborers log */}
                            {canSeeFinancials && (
                              <td className="px-3 py-1.5 text-sm tabular-nums text-gray-800">
                                {centsToDollars(co.laborCostCents > 0 ? co.laborCostCents : co.actualLaborCents)}
                              </td>
                            )}
                            {/* Est. Material */}
                            {canSeeFinancials && (
                              <td className="px-3 py-1.5 text-sm tabular-nums text-gray-800">
                                {centsToDollars(co.estMaterialCents)}
                              </td>
                            )}
                            {/* Act. Material — from materials log */}
                            {canSeeFinancials && (
                              <td className="px-3 py-1.5 text-sm tabular-nums text-gray-800">
                                {centsToDollars(co.materialCostCents > 0 ? co.materialCostCents : co.actualMaterialCents)}
                              </td>
                            )}
                            {/* Est. Hours */}
                            <td className="px-3 py-1.5 text-sm tabular-nums text-gray-800">
                              {co.estHours != null ? co.estHours : <span className="text-gray-400">-</span>}
                            </td>
                            {/* Act. Hours */}
                            <td className="px-3 py-1.5 text-sm tabular-nums text-gray-800">
                              {co.actualHours != null ? co.actualHours : <span className="text-gray-400">-</span>}
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
                              <td colSpan={colCount} className="bg-gray-50 px-6 py-2 pb-3 space-y-2">
                                {co.description && (
                                  <div className="rounded border border-gray-200 bg-white px-3 py-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Comments</p>
                                    <p className="mt-1 text-xs text-gray-700">{co.description}</p>
                                  </div>
                                )}
                                <div className="rounded border border-gray-200 bg-white px-3 py-2">
                                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Labor log</p>
                                  <LaborTable entries={co.laborers} showFinancials={canSeeFinancials} />
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
