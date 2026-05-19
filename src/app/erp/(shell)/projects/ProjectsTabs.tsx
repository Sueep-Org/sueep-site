"use client";

import { useState } from "react";
import { deriveProjectLifecycle } from "@/lib/erp/projectLifecycle";
import { ProjectsExpandableTable, type ProjectTableRow } from "./ProjectsExpandableTable";

type Tab = "all" | "post-construction" | "janitorial" | "residential" | "manual";
type Lifecycle = "ACTIVE" | "UPCOMING" | "COMPLETED" | "BILLING";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "post-construction", label: "Post-Construction" },
  { id: "janitorial", label: "Janitorial" },
  { id: "residential", label: "Residential" },
  { id: "manual", label: "Manual" },
];

const LIFECYCLE_FILTERS: {
  id: Lifecycle;
  label: string;
  dot: string;
  badge: string;
  activeBadge: string;
}[] = [
  {
    id: "UPCOMING",
    label: "Upcoming",
    dot: "bg-purple-500",
    badge: "border-purple-300 bg-purple-50 text-purple-700",
    activeBadge: "border-purple-500 bg-purple-500 text-white",
  },
  {
    id: "ACTIVE",
    label: "WIP",
    dot: "bg-emerald-500",
    badge: "border-emerald-300 bg-emerald-50 text-emerald-700",
    activeBadge: "border-emerald-500 bg-emerald-500 text-white",
  },
  {
    id: "BILLING",
    label: "Billing",
    dot: "bg-blue-500",
    badge: "border-blue-300 bg-blue-50 text-blue-700",
    activeBadge: "border-blue-500 bg-blue-500 text-white",
  },
  {
    id: "COMPLETED",
    label: "Completed",
    dot: "bg-gray-500",
    badge: "border-gray-300 bg-gray-100 text-gray-700",
    activeBadge: "border-gray-500 bg-gray-500 text-white",
  },
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
    if (!pid) return "manual";
    if (pid === janitorialPipelineId) return "janitorial";
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          placeholder="Search projects…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 sm:max-w-xs"
        />
        <div className="flex flex-wrap gap-2">
          {LIFECYCLE_FILTERS.map((lc) => {
            const isActive = activeLifecycle === lc.id;
            return (
              <button
                key={lc.id}
                onClick={() => toggleLifecycle(lc.id)}
                className={[
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  isActive ? lc.activeBadge : lc.badge,
                ].join(" ")}
              >
                <span className={["h-1.5 w-1.5 rounded-full", isActive ? "bg-white" : lc.dot].join(" ")} />
                {lc.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile: dropdown */}
      <select
        value={activeTab}
        onChange={(e) => setActiveTab(e.target.value as Tab)}
        className="sm:hidden mb-3 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
      >
        {TABS.filter((tab) => tab.id === "all" || countFor(tab.id) > 0).map((tab) => (
          <option key={tab.id} value={tab.id}>
            {tab.label} ({countFor(tab.id)})
          </option>
        ))}
      </select>

      {/* Desktop: tab buttons */}
      <div className="hidden sm:flex gap-1 border-b border-gray-200">
        {TABS.map((tab) => {
          const count = countFor(tab.id);
          if (count === 0 && tab.id !== "all") return null;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                isActive
                  ? "border-pink-600 text-pink-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
              ].join(" ")}
            >
              {tab.label}
              <span
                className={[
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  isActive ? "bg-pink-100 text-pink-700" : "bg-gray-100 text-gray-500",
                ].join(" ")}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            {query ? `No projects matching "${search}".` : "No projects in this category."}
          </p>
        ) : (
          <ProjectsExpandableTable rows={filtered} />
        )}
      </div>
    </div>
  );
}
