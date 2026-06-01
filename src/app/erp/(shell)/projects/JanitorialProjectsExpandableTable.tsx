"use client";

import { Fragment, useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import { centsToDollars } from "@/lib/erp/money";
import { deriveProjectLifecycle } from "@/lib/erp/projectLifecycle";
import { projectSegmentLabel } from "@/lib/erp/projectSegments";
import {
  billingBadge,
  CO_STATUS_COLORS,
  EmptyValue,
  LaborTable,
  projectStateClasses,
  TurnoverPricingSummary,
  type ProjectTableRow,
} from "./ProjectsExpandableTable";

function fmtShortDate(iso: string | null) {
  if (!iso) return <EmptyValue />;
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
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

function getBuildingName(project: ProjectTableRow) {
  return getDetailLine(project.description, "Property") || project.jobTitle.split(" - ")[0]?.trim() || project.jobTitle;
}

function getUnitSummary(project: ProjectTableRow) {
  return getDetailLine(project.description, "Units") || getDetailLine(project.description, "Unit Numbers");
}

function getProjectComments(project: ProjectTableRow) {
  return getDetailLine(project.description, "Comments");
}

function compactUnitSummary(units: string) {
  return units.replace(/\s*,?\s*dates?:.*?\)/i, ")").trim();
}

function getTurnoverLabel(project: ProjectTableRow) {
  const units = getUnitSummary(project);
  if (units) return compactUnitSummary(units).split(/\s+-\s+/)[0]?.trim() || units;

  const building = getBuildingName(project);
  const prefix = `${building} - `;
  return project.jobTitle.toLowerCase().startsWith(prefix.toLowerCase())
    ? project.jobTitle.slice(prefix.length).trim()
    : project.jobTitle;
}

function getScopeSummary(project: ProjectTableRow) {
  const units = getUnitSummary(project);
  return units.match(/\)\s*-\s*(.+)$/)?.[1]?.trim() || units;
}

const QUALITY_LABELS: Record<string, string> = {
  EXCELLENT: "Excellent",
  GOOD: "Good",
  FAIR: "Fair",
  POOR: "Poor",
};

const QUALITY_OPTIONS = [
  { value: "", label: "\u2014" },
  { value: "POOR", label: "1 \u2013 Poor" },
  { value: "FAIR", label: "2 \u2013 Fair" },
  { value: "GOOD", label: "3 \u2013 Good" },
  { value: "EXCELLENT", label: "4 \u2013 Excellent" },
];

const QUALITY_COLORS: Record<string, string> = {
  EXCELLENT: "text-emerald-600",
  GOOD: "text-gray-800",
  FAIR: "text-gray-500",
  POOR: "text-red-400",
};

function JanitorialQualitySection({ project }: { project: ProjectTableRow }) {
  const reviewedEntries = project.laborEntries.filter((entry) => Boolean(entry.qualityRating));
  const noteCount = project.laborEntries.filter((entry) => Boolean(entry.qualityNotes?.trim())).length;
  const unreviewedCount = project.laborEntries.length - reviewedEntries.length;
  const [qualityMap, setQualityMap] = useState<Record<string, string>>(() =>
    Object.fromEntries(project.laborEntries.map((entry) => [entry.id, entry.qualityRating ?? ""]))
  );
  const [notesMap, setNotesMap] = useState<Record<string, string>>(() =>
    Object.fromEntries(project.laborEntries.map((entry) => [entry.id, entry.qualityNotes ?? ""]))
  );
  const [popup, setPopup] = useState<{ id: string; updatePath: string; draft: string } | null>(null);
  const ratingCounts = reviewedEntries.reduce<Record<string, number>>((counts, entry) => {
    if (!entry.qualityRating) return counts;
    counts[entry.qualityRating] = (counts[entry.qualityRating] || 0) + 1;
    return counts;
  }, {});

  function handleQualityChange(entry: ProjectTableRow["laborEntries"][number], value: string) {
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
      <div className="overflow-x-auto rounded border border-gray-200 bg-white px-3 py-2">
        <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Quality</p>
            <p className="mt-1 text-sm font-semibold text-gray-900">Janitorial labor review</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="rounded bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
              {reviewedEntries.length}/{project.laborEntries.length} reviewed
            </span>
            {unreviewedCount > 0 ? (
              <span className="rounded bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                {unreviewedCount} open
              </span>
            ) : null}
            {noteCount > 0 ? (
              <span className="rounded bg-pink-50 px-2 py-0.5 font-medium text-pink-700">
                {noteCount} note{noteCount !== 1 ? "s" : ""}
              </span>
            ) : null}
          </div>
        </div>

        {reviewedEntries.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5 text-[11px]">
            {Object.entries(ratingCounts).map(([rating, count]) => (
              <span key={rating} className="rounded bg-gray-50 px-2 py-0.5 font-medium text-gray-700">
                {QUALITY_LABELS[rating] || rating}: {count}
              </span>
            ))}
          </div>
        ) : null}

        {project.laborEntries.length ? (
          <table className="w-full table-fixed text-xs">
            <colgroup>
              <col className="w-[68%]" />
              <col className="w-[32%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-gray-200 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                <th className="pb-1.5 pr-3 text-left font-semibold">Quality</th>
                <th className="pb-1.5 text-left font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {project.laborEntries.map((entry) => {
                const quality = qualityMap[entry.id] ?? "";
                const notes = notesMap[entry.id] ?? "";
                return (
                  <tr key={entry.id}>
                    <td className="py-1 pr-3">
                      <select
                        value={quality}
                        onChange={(ev) => {
                          ev.stopPropagation();
                          handleQualityChange(entry, ev.target.value);
                        }}
                        onClick={(ev) => ev.stopPropagation()}
                        className={`w-full rounded border border-gray-200 bg-white px-1 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-gray-300 ${QUALITY_COLORS[quality] ?? "text-gray-400"}`}
                      >
                        {QUALITY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1">
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setPopup({ id: entry.id, updatePath: entry.updatePath, draft: notes });
                        }}
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
        ) : (
          <p className="text-xs text-gray-400">No labor logged</p>
        )}
      </div>

      {popup ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setPopup(null)}>
          <div className="w-80 rounded-xl bg-white p-5 shadow-2xl" onClick={(ev) => ev.stopPropagation()}>
            <h3 className="mb-3 text-sm font-semibold text-gray-800">Quality Notes</h3>
            <textarea
              autoFocus
              rows={4}
              value={popup.draft}
              onChange={(ev) => setPopup((current) => current ? { ...current, draft: ev.target.value } : null)}
              placeholder="Add notes about work quality..."
              className="w-full resize-none rounded-lg border border-gray-200 p-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setPopup(null)} className="rounded-lg px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100">
                Cancel
              </button>
              <button type="button" onClick={handleNotesSave} className="rounded-lg bg-[#E73C6E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-pink-700">
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function JanitorialProjectDetails({ project }: { project: ProjectTableRow }) {
  const address = getDetailLine(project.description, "Address");
  const units = getUnitSummary(project);
  const comments = getProjectComments(project);
  const turnoverLabel = getTurnoverLabel(project);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 lg:grid-cols-[1.1fr_1fr]">
        <div className="rounded border border-gray-200 bg-white px-3 py-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Approved turnover</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">{turnoverLabel}</p>
            </div>
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
              Approved
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div>
              <p className="font-semibold uppercase tracking-wide text-gray-400">Start</p>
              <p className="mt-0.5 font-medium text-gray-900">{fmtShortDate(project.projectDate)}</p>
            </div>
            <div>
              <p className="font-semibold uppercase tracking-wide text-gray-400">PM</p>
              <p className="mt-0.5 font-medium text-gray-900">{project.supervisor || "Unassigned"}</p>
            </div>
            <div>
              <p className="font-semibold uppercase tracking-wide text-gray-400">Contract</p>
              <p className="mt-0.5 font-medium text-gray-900">{centsToDollars(project.contractValueCents)}</p>
            </div>
            <div>
              <p className="font-semibold uppercase tracking-wide text-gray-400">Progress</p>
              <p className="mt-0.5 font-medium text-gray-900">{project.percentDone}%</p>
            </div>
          </div>
        </div>

        <div className="rounded border border-gray-200 bg-white px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Project details</p>
          <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <span className="text-gray-400">Address</span>
            <span className="font-medium text-gray-800">{address || "-"}</span>
            <span className="text-gray-400">Units</span>
            <span className="font-medium text-gray-800">{units || "-"}</span>
            <span className="text-gray-400">Billing</span>
            <span>{billingBadge(project.billingStatus)}</span>
          </div>
          {comments ? <p className="mt-2 border-t border-gray-100 pt-2 text-xs text-gray-600">{comments}</p> : null}
        </div>
      </div>

      <JanitorialQualitySection project={project} />

      <TurnoverPricingSummary project={project} showPropertyTitle={false} showUnitsSummary={false} />
    </div>
  );
}

export function JanitorialProjectsExpandableTable({ rows }: { rows: ProjectTableRow[] }) {
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [openCoIds, setOpenCoIds] = useState<string[]>([]);
  const openSet = useMemo(() => new Set(openIds), [openIds]);
  const openCoSet = useMemo(() => new Set(openCoIds), [openCoIds]);

  function toggle(id: string) {
    setOpenIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleCo(coId: string, e: MouseEvent) {
    e.stopPropagation();
    setOpenCoIds((prev) => (prev.includes(coId) ? prev.filter((x) => x !== coId) : [...prev, coId]));
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
            <th className="px-3 py-2 font-semibold">Material (Est / Act)</th>
            <th className="px-3 py-2 font-semibold">Labor (Est / Act)</th>
            <th className="px-3 py-2 font-semibold">Hours (Est / Act)</th>
            <th className="px-3 py-2 font-semibold">Progress</th>
            <th className="px-3 py-2 font-semibold">% Invoiced</th>
            <th className="px-3 py-2 font-semibold">Billing Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const isOpen = openSet.has(p.id);
            const state = deriveProjectLifecycle(p.status, p.projectDate);
            const styles = projectStateClasses(state);
            const building = getBuildingName(p);
            const turnoverLabel = getTurnoverLabel(p);
            const scopeSummary = getScopeSummary(p);
            const rowBg = i % 2 === 0 ? "bg-white hover:bg-gray-100" : "bg-gray-50 hover:bg-gray-100";
            return (
              <Fragment key={p.id}>
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
                      {building} - {turnoverLabel}
                    </Link>
                    {scopeSummary ? <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">{scopeSummary}</p> : null}
                  </td>
                  <td className="w-[220px] min-w-[220px] px-3 py-2 text-gray-900">
                    {p.supervisor || <span className="text-gray-400">Unassigned</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-900">{projectSegmentLabel(p.segment)}</td>
                  <td className="px-3 py-2 text-gray-900">{centsToDollars(p.contractValueCents)}</td>
                  <td className="px-3 py-2 text-gray-900">
                    <span className="text-gray-500">E:</span> {centsToDollars(p.estMaterialCents)}{" "}
                    <span className="text-gray-500">/ A:</span> {centsToDollars(p.actualMaterialCents)}
                  </td>
                  <td className="px-3 py-2 text-gray-900">
                    <span className="text-gray-500">E:</span> {centsToDollars(p.estLaborCents)}{" "}
                    <span className="text-gray-500">/ A:</span> {centsToDollars(p.actualLaborCents)}
                  </td>
                  <td className="px-3 py-2 text-gray-900">
                    <span className="text-gray-500">E:</span> {p.estHours ?? "-"}{" "}
                    <span className="text-gray-500">/ A:</span> {p.actualHours.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-gray-900">{p.percentDone}%</td>
                  <td className="px-3 py-2 text-gray-900">
                    {p.percentInvoiced > 0 ? `${p.percentInvoiced}%` : <span className="text-gray-400">-</span>}
                  </td>
                  <td className="px-3 py-2">{billingBadge(p.billingStatus)}</td>
                </tr>

                {isOpen ? (
                  <>
                    <tr className={styles.detail}>
                      <td colSpan={10} className="px-4 py-2 pb-3" onClick={(e) => e.stopPropagation()}>
                        <JanitorialProjectDetails project={p} />
                      </td>
                    </tr>

                    {p.changeOrders.map((co) => {
                      const isCoOpen = openCoSet.has(co.id);
                      return (
                        <Fragment key={co.id}>
                          <tr className="cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors" onClick={(e) => toggleCo(co.id, e)} aria-expanded={isCoOpen}>
                            <td className="w-[420px] min-w-[420px] px-3 py-1.5">
                              <div className="flex items-center gap-2 pl-4">
                                <span className="shrink-0 text-gray-300">&gt;</span>
                                <span className="shrink-0 rounded bg-gray-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-600">CO</span>
                                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${CO_STATUS_COLORS[co.status]}`}>
                                  {co.status}
                                </span>
                                <Link
                                  href={`/erp/projects/${p.id}/change-orders/${co.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="truncate text-sm font-medium text-gray-700 hover:underline"
                                >
                                  {co.title}
                                </Link>
                              </div>
                            </td>
                            <td className="w-[220px] min-w-[220px] px-3 py-1.5 text-sm text-gray-700">
                              {co.requestedBy || <span className="text-gray-400">-</span>}
                            </td>
                            <td className="px-3 py-1.5 text-sm font-medium text-gray-500">Change Order</td>
                            <td className="px-3 py-1.5 text-sm tabular-nums text-gray-800">
                              {centsToDollars(co.estimatedCostCents)}
                            </td>
                            <td className="px-3 py-1.5 text-sm text-gray-700">
                              {co.estimatedDays != null ? <>{co.estimatedDays}d</> : <span className="text-gray-400">-</span>}
                            </td>
                            <td className="px-3 py-1.5 text-sm tabular-nums text-gray-800">
                              {co.laborCostCents > 0 ? centsToDollars(co.laborCostCents) : <span className="text-gray-400">-</span>}
                            </td>
                            <td className="px-3 py-1.5 text-gray-400">-</td>
                            <td className="px-3 py-1.5 text-gray-400">-</td>
                            <td className="px-3 py-1.5 text-gray-900">
                              {co.percentInvoiced > 0 ? `${co.percentInvoiced}%` : <span className="text-gray-400">-</span>}
                            </td>
                            <td className="px-3 py-1.5">{billingBadge(co.billingStatus)}</td>
                          </tr>

                          {isCoOpen ? (
                            <tr onClick={(e) => e.stopPropagation()}>
                              <td colSpan={10} className="bg-gray-50 px-6 py-2 pb-3">
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
