"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { centsToDollars } from "@/lib/erp/money";
import { deriveProjectLifecycle } from "@/lib/erp/projectLifecycle";
import { projectSegmentLabel } from "@/lib/erp/projectSegments";

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
  laborEntries: { date: string; role: string | null; name: string; hours: number; hourlyRateCents: number; description: string | null }[];
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
    laborers: { date: string; role: string | null; name: string; hours: number; hourlyRateCents: number; description: string | null }[];
    laborCostCents: number;
  }[];
};

export const CO_STATUS_COLORS: Record<"DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "VOID" | "BILLING", string> = {
  DRAFT: "bg-gray-200 text-gray-700",
  SUBMITTED: "bg-blue-100 text-blue-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  VOID: "bg-amber-100 text-amber-700",
  BILLING: "bg-emerald-100 text-emerald-700",
};

export function projectStateClasses(state: "COMPLETED" | "ACTIVE" | "UPCOMING"): { row: string; detail: string; sticky: string } {
  if (state === "COMPLETED") return { row: "bg-gray-100 hover:bg-gray-200", detail: "bg-gray-50", sticky: "bg-gray-200" };
  if (state === "UPCOMING") return { row: "bg-purple-50 hover:bg-purple-100", detail: "bg-purple-50", sticky: "bg-purple-100" };
  return { row: "bg-emerald-50 hover:bg-emerald-100", detail: "bg-emerald-50", sticky: "bg-emerald-100" };
}

type LaborRow = { date: string; role: string | null; name: string; hours: number; hourlyRateCents: number; description: string | null };

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

export function TurnoverPricingSummary({ project, showPropertyTitle = true }: { project: ProjectTableRow; showPropertyTitle?: boolean }) {
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
          {units ? <p className="mt-0.5 max-w-5xl text-xs text-slate-500">{units}</p> : null}
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

export function LaborTable({ entries, initialVisible = 5 }: { entries: LaborRow[]; initialVisible?: number }) {
  const [showAll, setShowAll] = useState(false);

  if (!entries.length) return <p className="text-xs text-gray-400">No labor logged</p>;

  const visibleEntries = showAll ? entries : entries.slice(0, initialVisible);
  const hiddenCount = Math.max(entries.length - visibleEntries.length, 0);

  return (
    <div>
      <table className="w-full table-fixed text-xs">
        <colgroup>
          <col className="w-[12%]" />
          <col className="w-[26%]" />
          <col className="w-[29%]" />
          <col className="w-[9%]" />
          <col className="w-[13%]" />
          <col className="w-[11%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-gray-200 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            <th className="pb-1.5 pr-3 text-left font-semibold">Date</th>
            <th className="pb-1.5 pr-3 text-left font-semibold">Job Title</th>
            <th className="pb-1.5 pr-3 text-left font-semibold">Name</th>
            <th className="pb-1.5 pr-3 text-right font-semibold">Hours</th>
            <th className="pb-1.5 pr-3 text-right font-semibold">Rate/hr</th>
            <th className="pb-1.5 text-left font-semibold">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {visibleEntries.map((e, i) => (
            <tr key={`${e.date}-${e.name}-${i}`} className="text-slate-900">
              <td className="py-1 pr-3 tabular-nums whitespace-nowrap">{fmtDate(e.date)}</td>
              <td className="py-1 pr-3 truncate">{e.role ?? <EmptyValue />}</td>
              <td className="py-1 pr-3 truncate font-medium">{e.name}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{e.hours.toFixed(2)}</td>
              <td className="py-1 pr-3 text-right tabular-nums whitespace-nowrap">{centsToDollars(e.hourlyRateCents)}</td>
              <td className="py-1 truncate text-slate-500">{e.description ?? <EmptyValue />}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowAll(true);
          }}
          className="mt-2 text-xs font-medium text-pink-600 hover:text-pink-700 hover:underline"
        >
          Show {hiddenCount} more
        </button>
      ) : showAll && entries.length > initialVisible ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowAll(false);
          }}
          className="mt-2 text-xs font-medium text-pink-600 hover:text-pink-700 hover:underline"
        >
          Show fewer
        </button>
      ) : null}
    </div>
  );
}

export function billingBadge(status: string | null) {
  if (!status) return <EmptyValue />;
  const map: Record<string, { label: string; cls: string }> = {
    BILLING: { label: "Billing", cls: "bg-emerald-100 text-emerald-700" },
    INVOICE_PAID: { label: "Invoice Paid", cls: "bg-emerald-100 text-emerald-700" },
    INACTIVE: { label: "Inactive", cls: "bg-gray-100 text-gray-600" },
  };
  const opt = map[status];
  if (!opt) return <EmptyValue />;
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${opt.cls}`}>{opt.label}</span>;
}

function isJanitorialProject(row: ProjectTableRow, janitorialPipelineId: string | null) {
  return (
    row.segment === "JANITORIAL_TURNOVER_REQUESTS" ||
    (Boolean(janitorialPipelineId) && row.hubspotPipelineId === janitorialPipelineId)
  );
}

export function ProjectsExpandableTable({ rows, janitorialPipelineId }: { rows: ProjectTableRow[]; janitorialPipelineId: string | null }) {
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [openCoIds, setOpenCoIds] = useState<string[]>([]);
  const openSet = useMemo(() => new Set(openIds), [openIds]);
  const openCoSet = useMemo(() => new Set(openCoIds), [openCoIds]);

  function toggle(id: string) {
    setOpenIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleCo(coId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setOpenCoIds((prev) => (prev.includes(coId) ? prev.filter((x) => x !== coId) : [...prev, coId]));
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-white">
      <table className="w-full min-w-[1600px] text-left text-sm">
        <thead className="border-b border-gray-300 text-xs uppercase">
          <tr>
            <th colSpan={3} className="border-b border-r border-gray-300 bg-blue-100 px-3 py-1.5 text-center font-semibold text-blue-700">
              Project Details
            </th>
            <th colSpan={4} className="border-b border-r border-gray-300 bg-orange-100 px-3 py-1.5 text-center font-semibold text-orange-700">
              Cost / Hours
            </th>
            <th colSpan={2} className="border-b border-r border-gray-300 bg-cyan-100 px-3 py-1.5 text-center font-semibold text-cyan-700">
              Progress
            </th>
            <th colSpan={2} className="border-b border-gray-300 bg-green-100 px-3 py-1.5 text-center font-semibold text-green-700">
              Invoicing
            </th>
          </tr>
          <tr className="bg-gray-100 text-pink-700">
            <th className="w-[420px] min-w-[420px] border-r border-gray-300 bg-gray-100 px-3 py-2 font-semibold">Job</th>
            <th className="w-[220px] min-w-[220px] border-r border-gray-300 px-3 py-2 font-semibold">PM</th>
            <th className="border-r border-gray-300 px-3 py-2 font-semibold">Segment</th>
            <th className="border-r border-gray-300 px-3 py-2 font-semibold">Contract</th>
            <th className="border-r border-gray-300 px-3 py-2 font-semibold">Material (Est / Act)</th>
            <th className="border-r border-gray-300 px-3 py-2 font-semibold">Labor (Est / Act)</th>
            <th className="border-r border-gray-300 px-3 py-2 font-semibold">Hours (Est / Act)</th>
            <th className="border-r border-gray-300 px-3 py-2 font-semibold">Progress</th>
            <th className="border-r border-gray-300 px-3 py-2 font-semibold">Miles</th>
            <th className="border-r border-gray-300 px-3 py-2 font-semibold">% Invoiced</th>
            <th className="px-3 py-2 font-semibold">Billing Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-300">
          {rows.map((p) => {
            const isOpen = openSet.has(p.id);
            const isJanitorial = isJanitorialProject(p, janitorialPipelineId);
            const state = deriveProjectLifecycle(p.status, p.projectDate);
            const styles = projectStateClasses(state);
            return (
              <Fragment key={p.id}>
                {/* Project row */}
                <tr
                  className={`${styles.row} cursor-pointer`}
                  onClick={() => toggle(p.id)}
                  aria-expanded={isOpen}
                  title={isOpen ? "Collapse" : "Expand"}
                >
                  <td className={`w-[420px] min-w-[420px] border-r border-gray-300 px-3 py-2 ${styles.sticky}`}>
                    <Link
                      href={`/erp/projects/${p.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-pink-600 hover:underline"
                    >
                      {p.jobTitle}
                    </Link>
                    {p.description ? <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">{p.description}</p> : null}
                  </td>
                  <td className="w-[220px] min-w-[220px] border-r border-gray-300 px-3 py-2 text-gray-900">
                    {p.supervisor || <span className="text-gray-400">Unassigned</span>}
                  </td>
                  <td className="border-r border-gray-300 px-3 py-2 text-gray-900">{projectSegmentLabel(p.segment)}</td>
                  <td className="border-r border-gray-300 px-3 py-2 text-gray-900">{centsToDollars(p.contractValueCents)}</td>
                  <td className="border-r border-gray-300 px-3 py-2 text-gray-900">
                    <span className="text-gray-500">E:</span> {centsToDollars(p.estMaterialCents)}{" "}
                    <span className="text-gray-500">/ A:</span> {centsToDollars(p.actualMaterialCents)}
                  </td>
                  <td className="border-r border-gray-300 px-3 py-2 text-gray-900">
                    <span className="text-gray-500">E:</span> {centsToDollars(p.estLaborCents)}{" "}
                    <span className="text-gray-500">/ A:</span> {centsToDollars(p.actualLaborCents)}
                  </td>
                  <td className="border-r border-gray-300 px-3 py-2 text-gray-900">
                    <span className="text-gray-500">E:</span> {p.estHours ?? "-"}{" "}
                    <span className="text-gray-500">/ A:</span> {p.actualHours.toFixed(2)}
                  </td>
                  <td className="border-r border-gray-300 px-3 py-2 text-gray-900">{p.percentDone}%</td>
                  <td className="border-r border-gray-300 px-3 py-2 text-gray-900">{p.miles.toFixed(1)}</td>
                  <td className="border-r border-gray-300 px-3 py-2 text-gray-900">
                    {p.percentInvoiced > 0 ? `${p.percentInvoiced}%` : <span className="text-gray-400">-</span>}
                  </td>
                  <td className="px-3 py-2">{billingBadge(p.billingStatus)}</td>
                </tr>

                {isOpen ? (
                  <>
                    {/* Project detail */}
                    <tr className={styles.detail}>
                      <td colSpan={11} className="px-4 py-2 pb-3" onClick={(e) => e.stopPropagation()}>
                        {isJanitorial ? (
                          <TurnoverPricingSummary project={p} />
                        ) : (
                          <div className="overflow-x-auto bg-white px-3 py-2">
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Team</p>
                            <LaborTable entries={p.laborEntries} />
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* Change order rows - inline in the same table, same columns */}
                    {p.changeOrders.map((co) => {
                      const isCoOpen = openCoSet.has(co.id);
                      return (
                        <Fragment key={co.id}>
                          <tr
                            className="cursor-pointer bg-pink-50 hover:bg-pink-100"
                            onClick={(e) => toggleCo(co.id, e)}
                            aria-expanded={isCoOpen}
                          >
                            {/* Job -> CO title + status */}
                            <td className="w-[420px] min-w-[420px] border-r border-gray-200 bg-pink-50 px-3 py-1.5">
                              <div className="flex items-center gap-2 pl-4">
                                <span className="shrink-0 text-gray-300">&gt;</span>
                                <span className="shrink-0 rounded bg-pink-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-pink-800">CO</span>
                                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${CO_STATUS_COLORS[co.status]}`}>
                                  {co.status}
                                </span>
                                <Link
                                  href={`/erp/projects/${p.id}/change-orders/${co.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="truncate text-sm font-medium text-pink-600 hover:underline"
                                >
                                  {co.title}
                                </Link>
                              </div>
                            </td>
                            {/* PM -> Requested by */}
                            <td className="w-[220px] min-w-[220px] border-r border-gray-200 px-3 py-1.5 text-sm text-gray-700">
                              {co.requestedBy || <span className="text-gray-400">-</span>}
                            </td>
                            {/* Segment -> "Change Order" label */}
                            <td className="border-r border-gray-200 px-3 py-1.5 text-sm font-medium text-pink-700">
                              Change Order
                            </td>
                            {/* Contract -> Est. Cost */}
                            <td className="border-r border-gray-200 px-3 py-1.5 text-sm tabular-nums text-gray-800">
                              {centsToDollars(co.estimatedCostCents)}
                            </td>
                            {/* Material -> Schedule days */}
                            <td className="border-r border-gray-200 px-3 py-1.5 text-sm text-gray-700">
                              {co.estimatedDays != null
                                ? <>{co.estimatedDays}d</>
                                : <span className="text-gray-400">-</span>}
                            </td>
                            {/* Labor -> labor cost */}
                            <td className="border-r border-gray-200 px-3 py-1.5 text-sm tabular-nums text-gray-800">
                              {co.laborCostCents > 0
                                ? centsToDollars(co.laborCostCents)
                                : <span className="text-gray-400">-</span>}
                            </td>
                            {/* Hours, Progress, Miles - not applicable to COs */}
                            <td className="border-r border-gray-200 px-3 py-1.5 text-gray-400">-</td>
                            <td className="border-r border-gray-200 px-3 py-1.5 text-gray-400">-</td>
                            <td className="border-r border-gray-200 px-3 py-1.5 text-gray-400">-</td>
                            <td className="border-r border-gray-200 px-3 py-1.5 text-gray-900">
                              {co.percentInvoiced > 0 ? `${co.percentInvoiced}%` : <span className="text-gray-400">-</span>}
                            </td>
                            {/* Billing Status -> CO billing status */}
                            <td className="px-3 py-1.5">{billingBadge(co.billingStatus)}</td>
                          </tr>

                          {/* Expanded CO detail */}
                          {isCoOpen ? (
                            <tr onClick={(e) => e.stopPropagation()}>
                              <td colSpan={11} className="bg-pink-50 px-6 py-2 pb-3">
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
                                      className="mt-auto pt-2 text-xs font-medium text-pink-600 hover:underline"
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
