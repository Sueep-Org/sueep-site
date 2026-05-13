"use client";

import { useState } from "react";
import { ProjectsExpandableTable, type ProjectTableRow } from "./ProjectsExpandableTable";

type Tab = "all" | "post-construction" | "janitorial" | "residential" | "manual";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "post-construction", label: "Post-Construction" },
  { id: "janitorial", label: "Janitorial" },
  { id: "residential", label: "Residential" },
  { id: "manual", label: "Manual" },
];

type Props = {
  rows: ProjectTableRow[];
  postConstructionPipelineId: string | null;
  janitorialPipelineId: string | null;
  residentialPipelineId: string | null;
};

export function ProjectsTabs({ rows, postConstructionPipelineId, janitorialPipelineId, residentialPipelineId }: Props) {
  const [active, setActive] = useState<Tab>("all");

  function getTab(row: ProjectTableRow): Tab {
    const pid = row.hubspotPipelineId;
    if (!pid) return "manual";
    if (pid === janitorialPipelineId) return "janitorial";
    if (pid === residentialPipelineId) return "residential";
    if (pid === postConstructionPipelineId) return "post-construction";
    return "manual";
  }

  const filtered = active === "all" ? rows : rows.filter((r) => getTab(r) === active);

  const countFor = (tab: Tab) => (tab === "all" ? rows.length : rows.filter((r) => getTab(r) === tab).length);

  return (
    <div>
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((tab) => {
          const count = countFor(tab.id);
          if (count === 0 && tab.id !== "all") return null;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
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
          <p className="py-8 text-center text-sm text-gray-500">No projects in this category.</p>
        ) : (
          <ProjectsExpandableTable rows={filtered} />
        )}
      </div>
    </div>
  );
}
