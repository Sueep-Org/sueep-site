"use client";

import { useState } from "react";
import { deriveProjectLifecycle } from "@/lib/erp/projectLifecycle";
import { normalizeProjectSegment } from "@/lib/erp/projectSegments";
import { ProjectsExpandableTable, type ProjectTableRow } from "./ProjectsExpandableTable";
import { JanitorialProjectsExpandableTable } from "./JanitorialProjectsExpandableTable";

type Tab = "all" | "post-construction" | "janitorial" | "residential" | "manual";
type Lifecycle = "ACTIVE" | "UPCOMING" | "COMPLETED" | "BILLING";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "post-construction", label: "Post-Const" },
  { id: "janitorial", label: "Janitorial" },
  { id: "residential", label: "Residential" },
  { id: "manual", label: "Manual" },
];

const LIFECYCLE_FILTERS: { id: Lifecycle; label: string }[] = [
  { id: "UPCOMING", label: "Upcoming" },
  { id: "ACTIVE", label: "WIP" },
  { id: "BILLING", label: "Billing" },
  { id: "COMPLETED", label: "Completed" },
];

type Props = {
  rows: ProjectTableRow[];
  postConstructionPipelineId: string | null;
  janitorialPipelineId: string | null;
  residentialPipelineId: string | null;
};

export function ProjectsTabs({ rows, postConstructionPipelineId, janitorialPipelineId, residentialPipelineId }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [activeLifecycle, setActiveLifecycle] = useState<Lifecycle | null>(null);
  const [search, setSearch] = useState("");

  function getTab(row: ProjectTableRow): Tab {
    const pid = row.hubspotPipelineId;
    const segment = normalizeProjectSegment(row.segment);
    const looksLikeTurnoverRequest =
      segment === "JANITORIAL_TURNOVER_REQUESTS" ||
      Boolean(row.description?.match(/^(Property|Units|Estimated Turnover Total|Pricing Breakdown):/im));

    if (pid === janitorialPipelineId || looksLikeTurnoverRequest) return "janitorial";
    if (pid === residentialPipelineId) return "residential";
    if (pid === postConstructionPipelineId) return "post-construction";
    return "manual";
  }

  function getLifecycle(row: ProjectTableRow): Lifecycle {
    return deriveProjectLifecycle(row.status, row.projectDate) as Lifecycle;
  }

  function matchesLifecycle(row: ProjectTableRow, lc: Lifecycle): boolean {
    if (lc === "BILLING") return row.billingStatus === "BILLING";
    return getLifecycle(row) === lc;
  }

  function toggleLifecycle(lc: Lifecycle) {
    setActiveLifecycle((prev) => (prev === lc ? null : lc));
  }

  const query = search.trim().toLowerCase();

  const filtered = rows.filter((r) => {
    if (activeTab !== "all" && getTab(r) !== activeTab) return false;
    if (activeLifecycle && !matchesLifecycle(r, activeLifecycle)) return false;
    if (query && !r.jobTitle.toLowerCase().includes(query)) return false;
    return true;
  });

  const countFor = (tab: Tab) => (tab === "all" ? rows.length : rows.filter((r) => getTab(r) === tab).length);

  return (
    <div>
      {/* Mobile */}
      <div className="flex flex-col gap-2 md:hidden mb-3">
        <select
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value as Tab)}
          className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        >
          {TABS.filter((tab) => tab.id === "all" || countFor(tab.id) > 0).map((tab) => (
            <option key={tab.id} value={tab.id}>{tab.label} ({countFor(tab.id)})</option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Search projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
          />
          <select
            value={activeLifecycle ?? ""}
            onChange={(e) => setActiveLifecycle((e.target.value as Lifecycle) || null)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-600 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
          >
            <option value="">All statuses</option>
            {LIFECYCLE_FILTERS.map((lc) => (
              <option key={lc.id} value={lc.id}>{lc.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Desktop: tabs + search/filter on one line */}
      <div className="hidden md:flex items-center justify-between border-b border-gray-200">
        <div className="flex gap-1">
          {TABS.map((tab) => {
            const count = countFor(tab.id);
            if (count === 0 && tab.id !== "all") return null;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "flex items-center gap-1 px-2 py-2 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                  isActive
                    ? "border-pink-600 text-pink-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
                ].join(" ")}
              >
                {tab.label}
                <span className={["rounded-full px-1.5 py-0.5 text-[10px] font-semibold", isActive ? "bg-pink-100 text-pink-700" : "bg-gray-100 text-gray-500"].join(" ")}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 pb-1">
          <input
            type="search"
            placeholder="Search projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 w-48"
          />
          <select
            value={activeLifecycle ?? ""}
            onChange={(e) => setActiveLifecycle((e.target.value as Lifecycle) || null)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-600 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
          >
            <option value="">All statuses</option>
            {LIFECYCLE_FILTERS.map((lc) => (
              <option key={lc.id} value={lc.id}>{lc.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            {query ? `No projects matching "${search}".` : "No projects in this category."}
          </p>
        ) : activeTab === "janitorial" ? (
          <JanitorialProjectsExpandableTable rows={filtered} />
        ) : (
          <ProjectsExpandableTable rows={filtered} janitorialPipelineId={janitorialPipelineId} />
        )}
      </div>
    </div>
  );
}
