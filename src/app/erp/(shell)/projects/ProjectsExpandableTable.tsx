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
  if (state === "COMPLETED") {
    return {
      row: "bg-gray-100 hover:bg-gray-200",
      detail: "bg-gray-50",
      sticky: "bg-gray-200",
    };
  }
  if (state === "UPCOMING") {
    return {
      row: "bg-purple-50 hover:bg-purple-100",
      detail: "bg-purple-50",
      sticky: "bg-purple-100",
    };
  }
  return {
    row: "bg-emerald-50 hover:bg-emerald-100",
    detail: "bg-emerald-50",
    sticky: "bg-emerald-100",
  };
}

export function ProjectsExpandableTable({ rows }: { rows: ProjectTableRow[] }) {
  const [openIds, setOpenIds] = useState<string[]>([]);
  const openSet = useMemo(() => new Set(openIds), [openIds]);

  function toggle(id: string) {
    setOpenIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-300">
      <table className="w-full min-w-[1400px] text-left text-sm">
        <thead className="border-b border-gray-300 bg-gray-100 text-xs uppercase text-gray-600">
          <tr>
            <th className="sticky left-0 z-40 w-[420px] min-w-[420px] border-r border-gray-300 bg-gray-100 px-3 py-2 font-medium">
              Job
            </th>
            <th className="sticky left-[420px] z-40 w-[220px] min-w-[220px] border-r border-gray-300 bg-gray-100 px-3 py-2 font-medium">
              Supervisor / PM
            </th>
            <th className="px-3 py-2 font-medium">Segment</th>
            <th className="px-3 py-2 font-medium">Contract</th>
            <th className="px-3 py-2 font-medium">Material (Est / Act)</th>
            <th className="px-3 py-2 font-medium">Labor (Est / Act)</th>
            <th className="px-3 py-2 font-medium">Hours (Est / Act)</th>
            <th className="px-3 py-2 font-medium">Progress</th>
            <th className="px-3 py-2 font-medium">Miles</th>
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
                  title={isOpen ? "Collapse project row" : "Expand project row"}
                >
                  <td className={`sticky left-0 z-30 w-[420px] min-w-[420px] border-r border-gray-300 px-3 py-2 ${styles.sticky}`}>
                    <Link
                      href={`/erp/projects/${p.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-pink-600 hover:underline"
                    >
                      {p.jobTitle}
                    </Link>
                    {p.description ? <p className="mt-1 text-xs text-gray-600 line-clamp-1">{p.description}</p> : null}
                  </td>
                  <td
                    className={`sticky left-[420px] z-30 w-[220px] min-w-[220px] border-r border-gray-300 px-3 py-2 text-gray-900 ${styles.sticky}`}
                  >
                    {p.supervisor || "Unassigned PM"}
                  </td>
                  <td className="px-3 py-2 text-gray-900">{projectSegmentLabel(p.segment)}</td>
                  <td className="px-3 py-2 text-gray-900">{centsToDollars(p.contractValueCents)}</td>
                  <td className="px-3 py-2 text-gray-900">
                    <span className="text-gray-600">E:</span> {centsToDollars(p.estMaterialCents)}{" "}
                    <span className="text-gray-600">/ A:</span> {centsToDollars(p.actualMaterialCents)}
                  </td>
                  <td className="px-3 py-2 text-gray-900">
                    <span className="text-gray-600">E:</span> {centsToDollars(p.estLaborCents)}{" "}
                    <span className="text-gray-600">/ A:</span> {centsToDollars(p.actualLaborCents)}
                  </td>
                  <td className="px-3 py-2 text-gray-900">
                    <span className="text-gray-600">E:</span> {p.estHours ?? "—"}{" "}
                    <span className="text-gray-600">/ A:</span> {p.actualHours.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-gray-900">{p.percentDone}%</td>
                  <td className="px-3 py-2 text-gray-900">{p.miles.toFixed(1)}</td>
                </tr>
                {isOpen ? (
                  <tr className={styles.detail}>
                    <td colSpan={9} className="px-4 py-3">
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