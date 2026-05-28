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
    <div className="overflow-x-auto rounded-lg border border-white">
      <table className="w-full min-w-[1420px] text-left text-sm">
        <thead className="border-b border-white text-xs uppercase">
          <tr>
            <th colSpan={3} className="border-b border-r border-white bg-emerald-100 px-3 py-1.5 text-center font-semibold text-emerald-700">
              Janitorial Details
            </th>
            <th colSpan={4} className="border-b border-r border-white bg-orange-100 px-3 py-1.5 text-center font-semibold text-orange-700">
              Turnover Budget
            </th>
            <th colSpan={2} className="border-b border-r border-white bg-cyan-100 px-3 py-1.5 text-center font-semibold text-cyan-700">
              Progress
            </th>
            <th colSpan={2} className="border-b border-white bg-green-100 px-3 py-1.5 text-center font-semibold text-green-700">
              Invoicing
            </th>
          </tr>
          <tr className="bg-pink-500 text-white">
            <th className="w-[420px] min-w-[420px] border-r border-white bg-pink-500 px-3 py-2 font-medium">Building / Turnover</th>
            <th className="w-[220px] min-w-[220px] border-r border-white px-3 py-2 font-medium">PM</th>
            <th className="border-r border-white px-3 py-2 font-medium">Start</th>
            <th className="border-r border-white px-3 py-2 font-medium">Contract</th>
            <th className="border-r border-white px-3 py-2 font-medium">Materials</th>
            <th className="border-r border-white px-3 py-2 font-medium">Labor</th>
            <th className="border-r border-white px-3 py-2 font-medium">Hours</th>
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
            const styles = projectStateClasses(state);

            return (
              <Fragment key={p.id}>
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
                  <td className="border-r border-gray-300 px-3 py-2 text-gray-900 tabular-nums">{fmtShortDate(p.projectDate)}</td>
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
                    <tr className={styles.detail}>
                      <td colSpan={11} className="px-4 py-2 pb-3" onClick={(e) => e.stopPropagation()}>
                        <TurnoverPricingSummary project={p} />
                      </td>
                    </tr>

                    {p.changeOrders.map((co) => {
                      const isCoOpen = openCoSet.has(co.id);
                      return (
                        <Fragment key={co.id}>
                          <tr className="cursor-pointer bg-pink-50 hover:bg-pink-100" onClick={(e) => toggleCo(co.id, e)} aria-expanded={isCoOpen}>
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
                            <td className="w-[220px] min-w-[220px] border-r border-gray-200 px-3 py-1.5 text-sm text-gray-700">
                              {co.requestedBy || <span className="text-gray-400">-</span>}
                            </td>
                            <td className="border-r border-gray-200 px-3 py-1.5 text-sm font-medium text-pink-700">Change Order</td>
                            <td className="border-r border-gray-200 px-3 py-1.5 text-sm tabular-nums text-gray-800">
                              {centsToDollars(co.estimatedCostCents)}
                            </td>
                            <td className="border-r border-gray-200 px-3 py-1.5 text-sm text-gray-700">
                              {co.estimatedDays != null ? <>{co.estimatedDays}d</> : <span className="text-gray-400">-</span>}
                            </td>
                            <td className="border-r border-gray-200 px-3 py-1.5 text-sm tabular-nums text-gray-800">
                              {co.laborCostCents > 0 ? centsToDollars(co.laborCostCents) : <span className="text-gray-400">-</span>}
                            </td>
                            <td className="border-r border-gray-200 px-3 py-1.5 text-gray-400">-</td>
                            <td className="border-r border-gray-200 px-3 py-1.5 text-gray-400">-</td>
                            <td className="border-r border-gray-200 px-3 py-1.5 text-gray-400">-</td>
                            <td className="border-r border-gray-200 px-3 py-1.5 text-gray-900">
                              {co.percentInvoiced > 0 ? `${co.percentInvoiced}%` : <span className="text-gray-400">-</span>}
                            </td>
                            <td className="px-3 py-1.5">{billingBadge(co.billingStatus)}</td>
                          </tr>

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
