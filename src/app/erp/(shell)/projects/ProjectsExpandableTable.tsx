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
  employees: string[];
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
    status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "VOID";
    billingStatus: string | null;
    estimatedCostCents: number | null;
    estimatedDays: number | null;
    requestedBy: string | null;
    supervisor: string | null;
    description: string | null;
    laborers: string[];
    laborCostCents: number;
  }[];
};

const CO_STATUS_COLORS: Record<"DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "VOID", string> = {
  DRAFT: "bg-gray-200 text-gray-700",
  SUBMITTED: "bg-blue-100 text-blue-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  VOID: "bg-amber-100 text-amber-700",
};

function stateClasses(state: "COMPLETED" | "ACTIVE" | "UPCOMING"): { row: string; detail: string; sticky: string } {
  if (state === "COMPLETED") return { row: "bg-gray-100 hover:bg-gray-200", detail: "bg-gray-50", sticky: "bg-gray-200" };
  if (state === "UPCOMING") return { row: "bg-purple-50 hover:bg-purple-100", detail: "bg-purple-50", sticky: "bg-purple-100" };
  return { row: "bg-emerald-50 hover:bg-emerald-100", detail: "bg-emerald-50", sticky: "bg-emerald-100" };
}

function billingBadge(status: string | null) {
  if (!status) return <span className="text-gray-400">—</span>;
  const map: Record<string, { label: string; cls: string }> = {
    BILLING: { label: "Billing", cls: "bg-blue-100 text-blue-700" },
    INVOICE_PAID: { label: "Invoice Paid", cls: "bg-emerald-100 text-emerald-700" },
    INACTIVE: { label: "Inactive", cls: "bg-gray-100 text-gray-600" },
  };
  const opt = map[status];
  if (!opt) return <span className="text-gray-400">—</span>;
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${opt.cls}`}>{opt.label}</span>;
}

export function ProjectsExpandableTable({ rows }: { rows: ProjectTableRow[] }) {
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
        <thead className="border-b border-white text-xs uppercase">
          <tr>
            <th colSpan={3} className="border-b border-r border-white bg-blue-100 px-3 py-1.5 text-center font-semibold text-blue-700">
              Project Details
            </th>
            <th colSpan={4} className="border-b border-r border-white bg-orange-100 px-3 py-1.5 text-center font-semibold text-orange-700">
              Cost / Hours
            </th>
            <th colSpan={2} className="border-b border-r border-white bg-cyan-100 px-3 py-1.5 text-center font-semibold text-cyan-700">
              Progress
            </th>
            <th colSpan={2} className="border-b border-white bg-green-100 px-3 py-1.5 text-center font-semibold text-green-700">
              Invoicing
            </th>
          </tr>
          <tr className="bg-pink-500 text-white">
            <th className="md:sticky md:left-0 md:z-40 w-[420px] min-w-[420px] border-r border-white bg-pink-500 px-3 py-2 font-medium">Job</th>
            <th className="w-[220px] min-w-[220px] border-r border-white px-3 py-2 font-medium">PM</th>
            <th className="border-r border-white px-3 py-2 font-medium">Segment</th>
            <th className="border-r border-white px-3 py-2 font-medium">Contract</th>
            <th className="border-r border-white px-3 py-2 font-medium">Material (Est / Act)</th>
            <th className="border-r border-white px-3 py-2 font-medium">Labor (Est / Act)</th>
            <th className="border-r border-white px-3 py-2 font-medium">Hours (Est / Act)</th>
            <th className="border-r border-white px-3 py-2 font-medium">Progress</th>
            <th className="border-r border-white px-3 py-2 font-medium">Miles</th>
            <th className="border-r border-white px-3 py-2 font-medium">% Invoiced</th>
            <th className="px-3 py-2 font-medium">Billing Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-300">
          {rows.map((p) => {
            const isOpen = openSet.has(p.id);
            const state = deriveProjectLifecycle(p.status, p.projectDate);
            const styles = stateClasses(state);
            return (
              <Fragment key={p.id}>
                {/* Project row */}
                <tr
                  className={`${styles.row} cursor-pointer`}
                  onClick={() => toggle(p.id)}
                  aria-expanded={isOpen}
                  title={isOpen ? "Collapse" : "Expand"}
                >
                  <td className={`md:sticky md:left-0 md:z-30 w-[420px] min-w-[420px] border-r border-gray-300 px-3 py-2 ${styles.sticky}`}>
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
                    <span className="text-gray-500">E:</span> {p.estHours ?? "—"}{" "}
                    <span className="text-gray-500">/ A:</span> {p.actualHours.toFixed(2)}
                  </td>
                  <td className="border-r border-gray-300 px-3 py-2 text-gray-900">{p.percentDone}%</td>
                  <td className="border-r border-gray-300 px-3 py-2 text-gray-900">{p.miles.toFixed(1)}</td>
                  <td className="border-r border-gray-300 px-3 py-2 text-gray-900">
                    {p.percentInvoiced > 0 ? `${p.percentInvoiced}%` : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-2">{billingBadge(p.billingStatus)}</td>
                </tr>

                {isOpen ? (
                  <>
                    {/* Change order rows — inline in the same table, same columns */}
                    {p.changeOrders.map((co) => {
                      const isCoOpen = openCoSet.has(co.id);
                      return (
                        <Fragment key={co.id}>
                          <tr
                            className="cursor-pointer bg-pink-50 hover:bg-pink-100"
                            onClick={(e) => toggleCo(co.id, e)}
                            aria-expanded={isCoOpen}
                          >
                            {/* Job → CO title + status */}
                            <td className={`md:sticky md:left-0 md:z-30 w-[420px] min-w-[420px] border-r border-gray-200 bg-pink-50 px-3 py-1.5`}>
                              <div className="flex items-center gap-2 pl-4">
                                <span className="shrink-0 text-gray-300">↳</span>
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
                            {/* PM → Requested by */}
                            <td className="w-[220px] min-w-[220px] border-r border-gray-200 px-3 py-1.5 text-sm text-gray-700">
                              {co.requestedBy || <span className="text-gray-400">—</span>}
                            </td>
                            {/* Segment → "Change Order" label */}
                            <td className="border-r border-gray-200 px-3 py-1.5 text-sm font-medium text-pink-700">
                              Change Order
                            </td>
                            {/* Contract → Est. Cost */}
                            <td className="border-r border-gray-200 px-3 py-1.5 text-sm tabular-nums text-gray-800">
                              {centsToDollars(co.estimatedCostCents)}
                            </td>
                            {/* Material → Schedule days */}
                            <td className="border-r border-gray-200 px-3 py-1.5 text-sm text-gray-700">
                              {co.estimatedDays != null
                                ? <>{co.estimatedDays}d</>
                                : <span className="text-gray-400">—</span>}
                            </td>
                            {/* Labor → labor cost */}
                            <td className="border-r border-gray-200 px-3 py-1.5 text-sm tabular-nums text-gray-800">
                              {co.laborCostCents > 0
                                ? centsToDollars(co.laborCostCents)
                                : <span className="text-gray-400">—</span>}
                            </td>
                            {/* Hours, Progress, Miles, % Invoiced — not applicable */}
                            <td className="border-r border-gray-200 px-3 py-1.5 text-gray-400">—</td>
                            <td className="border-r border-gray-200 px-3 py-1.5 text-gray-400">—</td>
                            <td className="border-r border-gray-200 px-3 py-1.5 text-gray-400">—</td>
                            <td className="border-r border-gray-200 px-3 py-1.5 text-gray-400">—</td>
                            {/* Billing Status → CO billing status badge */}
                            <td className="px-3 py-1.5">{billingBadge(co.billingStatus)}</td>
                          </tr>

                          {/* Expanded CO detail */}
                          {isCoOpen ? (
                            <tr onClick={(e) => e.stopPropagation()}>
                              <td colSpan={11} className="bg-pink-50 px-6 py-2 pb-3">
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                  <div className="rounded border border-gray-200 bg-white px-3 py-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Laborers</p>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {co.laborers.length ? (
                                        co.laborers.map((name) => (
                                          <span key={name} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                                            {name}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-xs text-gray-400">None assigned</span>
                                      )}
                                    </div>
                                  </div>

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
                                        {co.estimatedDays != null ? `${co.estimatedDays} day${co.estimatedDays !== 1 ? "s" : ""}` : "—"}
                                      </span>
                                      <span className="text-gray-400">Requested by</span>
                                      <span className="font-medium text-gray-800">{co.requestedBy || "—"}</span>
                                    </div>
                                  </div>

                                  <div className="flex flex-col rounded border border-gray-200 bg-white px-3 py-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Supervisor</p>
                                    <p className="mt-1 text-sm font-semibold text-gray-800">{co.supervisor || "—"}</p>
                                    <Link
                                      href={`/erp/projects/${p.id}/change-orders/${co.id}`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="mt-auto pt-2 text-xs font-medium text-pink-600 hover:underline"
                                    >
                                      Full details →
                                    </Link>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}

                    {/* Project summary cards */}
                    <tr className={styles.detail}>
                      <td colSpan={11} className="px-4 py-2">
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                          <div className="rounded border border-gray-200 bg-white px-3 py-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Team</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {p.employees.length ? p.employees.map((name) => (
                                <span key={name} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{name}</span>
                              )) : <span className="text-xs text-gray-400">No labor logged</span>}
                            </div>
                          </div>

                          <div className="rounded border border-gray-200 bg-white px-3 py-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Labor</p>
                            <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
                              <span className="text-gray-400">Est.</span><span className="font-medium text-gray-800">{centsToDollars(p.estLaborCents)}</span>
                              <span className="text-gray-400">Actual</span><span className="font-medium text-gray-800">{centsToDollars(p.actualLaborCents)}</span>
                              <span className="text-gray-400">Est. hrs</span><span className="font-medium text-gray-800">{p.estHours ?? "—"}</span>
                              <span className="text-gray-400">Act. hrs</span><span className="font-medium text-gray-800">{p.actualHours.toFixed(1)}</span>
                            </div>
                          </div>

                          <div className="rounded border border-gray-200 bg-white px-3 py-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Materials</p>
                            <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
                              <span className="text-gray-400">Est.</span><span className="font-medium text-gray-800">{centsToDollars(p.estMaterialCents)}</span>
                              <span className="text-gray-400">Actual</span><span className="font-medium text-gray-800">{centsToDollars(p.actualMaterialCents)}</span>
                              <span className="text-gray-400">Cleaning</span><span className="font-medium text-gray-800">{centsToDollars(p.cleaningCents)}</span>
                              <span className="text-gray-400">Paint</span><span className="font-medium text-gray-800">{centsToDollars(p.paintCents)}</span>
                            </div>
                          </div>

                          <div className="flex flex-col rounded border border-gray-200 bg-white px-3 py-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Distance</p>
                            <p className="mt-1 text-sm font-semibold text-gray-800">{p.miles.toFixed(1)} <span className="text-xs font-normal text-gray-400">mi</span></p>
                            <Link
                              href={`/erp/projects/${p.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-auto pt-2 text-xs font-medium text-pink-600 hover:underline"
                            >
                              Full details →
                            </Link>
                          </div>
                        </div>
                      </td>
                    </tr>
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
