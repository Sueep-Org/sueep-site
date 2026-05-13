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
  const openSet = useMemo(() => new Set(openIds), [openIds]);

  function toggle(id: string) {
    setOpenIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-white">
      <table className="w-full min-w-[1600px] text-left text-sm">
        <thead className="border-b border-white text-xs uppercase">
          {/* Group header row — no sticky here to avoid colSpan rendering bugs */}
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
          {/* Column header row */}
          <tr className="bg-pink-400 text-white">
            <th className="md:sticky md:left-0 md:z-40 w-[420px] min-w-[420px] border-r border-white bg-pink-400 px-3 py-2 font-medium">Job</th>
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
                <tr
                  className={`${styles.row} cursor-pointer`}
                  onClick={() => toggle(p.id)}
                  aria-expanded={isOpen}
                  title={isOpen ? "Collapse" : "Expand"}
                >
                  {/* Project Details */}
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

                  {/* Cost / Hours */}
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

                  {/* Progress */}
                  <td className="border-r border-gray-300 px-3 py-2 text-gray-900">{p.percentDone}%</td>
                  <td className="border-r border-gray-300 px-3 py-2 text-gray-900">{p.miles.toFixed(1)}</td>

                  {/* Invoicing */}
                  <td className="border-r border-gray-300 px-3 py-2 text-gray-900">
                    {p.percentInvoiced > 0 ? `${p.percentInvoiced}%` : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-2">{billingBadge(p.billingStatus)}</td>
                </tr>

                {isOpen ? (
                  <tr className={styles.detail}>
                    <td colSpan={11} className="px-4 py-3">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <div>
                          <p className="text-[10px] uppercase text-gray-600">Team</p>
                          <p className="mt-1 text-sm text-gray-900">
                            {p.employees.length ? p.employees.join(", ") : "No labor logs yet"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-gray-600">Labor (Est / Act)</p>
                          <p className="mt-1 text-sm text-gray-900">
                            {centsToDollars(p.estLaborCents)} / {centsToDollars(p.actualLaborCents)}
                          </p>
                          <p className="text-xs text-gray-600">Hours: {p.estHours ?? "—"} / {p.actualHours.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-gray-600">Materials (Est / Act)</p>
                          <p className="mt-1 text-sm text-gray-900">
                            {centsToDollars(p.estMaterialCents)} / {centsToDollars(p.actualMaterialCents)}
                          </p>
                          <p className="text-xs text-gray-600">
                            Cleaning: {centsToDollars(p.cleaningCents)} · Paint: {centsToDollars(p.paintCents)} · Miles: {p.miles.toFixed(1)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 text-xs">
                        <Link href={`/erp/projects/${p.id}`} className="font-medium text-pink-600 hover:underline">
                          Open full project details →
                        </Link>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
