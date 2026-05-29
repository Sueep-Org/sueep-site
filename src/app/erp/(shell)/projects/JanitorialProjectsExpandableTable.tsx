"use client";

import { Fragment, useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import { centsToDollars } from "@/lib/erp/money";
import { deriveProjectLifecycle } from "@/lib/erp/projectLifecycle";
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

      <TurnoverPricingSummary project={project} showPropertyTitle={false} showUnitsSummary={false} />
    </div>
  );
}

export function JanitorialProjectsExpandableTable({ rows }: { rows: ProjectTableRow[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, ProjectTableRow[]>();
    rows.forEach((row) => {
      const building = getBuildingName(row);
      map.set(building, [...(map.get(building) || []), row]);
    });
    return Array.from(map.entries()).map(([building, projects]) => ({
      building,
      projects,
      contractCents: projects.reduce((sum, project) => sum + (project.contractValueCents || 0), 0),
      activeCount: projects.filter((project) => deriveProjectLifecycle(project.status, project.projectDate) === "ACTIVE").length,
    }));
  }, [rows]);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [closedBuildings, setClosedBuildings] = useState<string[]>([]);
  const [openCoIds, setOpenCoIds] = useState<string[]>([]);
  const openSet = useMemo(() => new Set(openIds), [openIds]);
  const closedBuildingSet = useMemo(() => new Set(closedBuildings), [closedBuildings]);
  const openCoSet = useMemo(() => new Set(openCoIds), [openCoIds]);

  function toggle(id: string) {
    setOpenIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleBuilding(building: string) {
    setClosedBuildings((prev) => (prev.includes(building) ? prev.filter((x) => x !== building) : [...prev, building]));
  }

  function toggleCo(coId: string, e: MouseEvent) {
    e.stopPropagation();
    setOpenCoIds((prev) => (prev.includes(coId) ? prev.filter((x) => x !== coId) : [...prev, coId]));
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full min-w-[1300px] text-left text-sm">
        <thead className="border-b border-gray-300 text-xs uppercase">
          <tr className="bg-gray-200 text-gray-700">
            <th className="w-[420px] min-w-[420px] px-3 py-2 font-semibold">Building / Turnover</th>
            <th className="w-[220px] min-w-[220px] px-3 py-2 font-semibold">PM</th>
            <th className="px-3 py-2 font-semibold">Start</th>
            <th className="px-3 py-2 font-semibold">Contract</th>
            <th className="px-3 py-2 font-semibold">Materials</th>
            <th className="px-3 py-2 font-semibold">Labor</th>
            <th className="px-3 py-2 font-semibold">Hours</th>
            <th className="px-3 py-2 font-semibold">Progress</th>
            <th className="px-3 py-2 font-semibold">% Invoiced</th>
            <th className="px-3 py-2 font-semibold">Billing Status</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const isGroupClosed = closedBuildingSet.has(group.building);
            return (
              <Fragment key={group.building}>
                <tr
                  className="cursor-pointer border-t border-gray-200 bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                  onClick={() => toggleBuilding(group.building)}
                  aria-expanded={!isGroupClosed}
                >
                  <td className="w-[420px] min-w-[420px] px-3 py-2 font-semibold">
                    <span className="mr-2 text-gray-400">{isGroupClosed ? ">" : "v"}</span>
                    {group.building}
                    <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                      {group.projects.length} turnover{group.projects.length !== 1 ? "s" : ""}
                    </span>
                  </td>
                  <td className="w-[220px] min-w-[220px] px-3 py-2 text-xs font-medium text-gray-700">
                    {group.activeCount} WIP
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-400">-</td>
                  <td className="px-3 py-2 font-semibold tabular-nums text-gray-900">{centsToDollars(group.contractCents)}</td>
                  <td className="px-3 py-2 text-gray-400" colSpan={6}>-</td>
                </tr>

                {!isGroupClosed
                  ? group.projects.map((p, j) => {
                      const isOpen = openSet.has(p.id);
                      const state = deriveProjectLifecycle(p.status, p.projectDate);
                      const styles = projectStateClasses(state);
                      const turnoverLabel = getTurnoverLabel(p);
                      const scopeSummary = getScopeSummary(p);
                      const rowBg = j % 2 === 0 ? "bg-white hover:bg-gray-100" : "bg-gray-50 hover:bg-gray-100";
                      return (
                        <Fragment key={p.id}>
                          <tr
                            className={`${rowBg} cursor-pointer transition-colors`}
                            onClick={() => toggle(p.id)}
                            aria-expanded={isOpen}
                            title={isOpen ? "Collapse" : "Expand"}
                          >
                            <td className="w-[420px] min-w-[420px] px-3 py-1.5">
                              <div className="flex items-center gap-2 pl-4">
                                <span className="shrink-0 text-gray-400">{isOpen ? "v" : ">"}</span>
                                <span className="shrink-0 rounded bg-gray-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-600">
                                  Turn
                                </span>
                                <span className="shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-green-700">
                                  Approved
                                </span>
                                <div className="min-w-0">
                                  <Link
                                    href={`/erp/projects/${p.id}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className={`font-medium ${styles.titleLink}`}
                                  >
                                    {turnoverLabel}
                                  </Link>
                                </div>
                              </div>
                              {scopeSummary ? <p className="mt-1 pl-4 text-xs text-gray-500 line-clamp-1">{scopeSummary}</p> : null}
                            </td>
                            <td className="w-[220px] min-w-[220px] px-3 py-1.5 text-sm text-gray-700">
                              {p.supervisor || <span className="text-gray-400">Unassigned</span>}
                            </td>
                            <td className="px-3 py-1.5 text-sm tabular-nums text-gray-800">{fmtShortDate(p.projectDate)}</td>
                            <td className="px-3 py-1.5 text-sm tabular-nums text-gray-800">{centsToDollars(p.contractValueCents)}</td>
                            <td className="px-3 py-1.5 text-sm text-gray-800">
                              <span className="text-gray-500">E:</span> {centsToDollars(p.estMaterialCents)}{" "}
                              <span className="text-gray-500">/ A:</span> {centsToDollars(p.actualMaterialCents)}
                            </td>
                            <td className="px-3 py-1.5 text-sm text-gray-800">
                              <span className="text-gray-500">E:</span> {centsToDollars(p.estLaborCents)}{" "}
                              <span className="text-gray-500">/ A:</span> {centsToDollars(p.actualLaborCents)}
                            </td>
                            <td className="px-3 py-1.5 text-sm text-gray-800">
                              <span className="text-gray-500">E:</span> {p.estHours ?? "-"}{" "}
                              <span className="text-gray-500">/ A:</span> {p.actualHours.toFixed(2)}
                            </td>
                            <td className="px-3 py-1.5 text-sm text-gray-800">{p.percentDone}%</td>
                            <td className="px-3 py-1.5 text-sm text-gray-900">
                              {p.percentInvoiced > 0 ? `${p.percentInvoiced}%` : <span className="text-gray-400">-</span>}
                            </td>
                            <td className="px-3 py-1.5">{billingBadge(p.billingStatus)}</td>
                          </tr>

                          {isOpen ? (
                            <>
                              <tr className={styles.detail}>
                                <td colSpan={10} className="px-6 py-2 pb-3" onClick={(e) => e.stopPropagation()}>
                                  <JanitorialProjectDetails project={p} />
                                </td>
                              </tr>

                              {p.changeOrders.map((co) => {
                                const isCoOpen = openCoSet.has(co.id);
                                return (
                                  <Fragment key={co.id}>
                                    <tr className="cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors" onClick={(e) => toggleCo(co.id, e)} aria-expanded={isCoOpen}>
                                      <td className="w-[420px] min-w-[420px] px-3 py-1.5">
                                        <div className="flex items-center gap-2 pl-8">
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
                                      <td className="px-3 py-1.5 text-gray-400">-</td>
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
                    })
                  : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
