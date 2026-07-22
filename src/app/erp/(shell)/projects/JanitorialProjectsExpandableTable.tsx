"use client";

import { ProjectsExpandableTable, type ProjectTableRow } from "./ProjectsExpandableTable";
import { formatUnitDisplay } from "@/lib/erp/unitDisplay";
import { deriveProjectLifecycle, hasActiveChangeOrder } from "@/lib/erp/projectLifecycle";

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

function janitorialBuildingTitle(row: ProjectTableRow) {
  return row.buildingName || getDetailLine(row.description, "Property") || row.jobTitle.split(/\s+-\s+/)[0]?.trim() || row.jobTitle;
}

function janitorialBuildingHref(row: ProjectTableRow) {
  return row.buildingId ? `/erp/buildings/${row.buildingId}?from=projects` : null;
}

function unitsFromDescription(row: ProjectTableRow) {
  const units = getDetailLine(row.description, "Units") || getDetailLine(row.description, "Unit Numbers");
  if (!units) return "";

  return units
    .split(/\s+\|\s+/)
    .map((unit) => unit.match(/^\s*([^(|]+)/)?.[1]?.trim() || "")
    .filter(Boolean)
    .join(", ");
}

function unitTitleFromJobTitle(row: ProjectTableRow) {
  const title = row.jobTitle.trim();
  if (!/^Unit\b/i.test(title)) return "";

  return title.replace(/\s+-\s+Turnover request$/i, "").trim();
}

function janitorialRowTitle(row: ProjectTableRow) {
  const rawUnits = getDetailLine(row.description, "Units") || getDetailLine(row.description, "Unit Numbers");
  const units = unitsFromDescription(row);
  if (units) {
    if (rawUnits && rawUnits.toLowerCase().includes("(common area")) return units;
    return formatUnitDisplay(units);
  }

  return unitTitleFromJobTitle(row) || "1 unit";
}

function janitorialRowDescription(_row: ProjectTableRow) {
  return null;
}

// WIP (active) first, then upcoming, then completed — matches the order
// David works units in: finish what's in progress, then what's coming up,
// with wrapped-up units sorted to the bottom out of the way.
function lifecycleRank(row: ProjectTableRow): number {
  const lifecycle = deriveProjectLifecycle(row.status, row.projectDate, hasActiveChangeOrder(row.changeOrders));
  if (lifecycle === "ACTIVE") return 0;
  if (lifecycle === "UPCOMING") return 1;
  return 2;
}

export function JanitorialProjectsExpandableTable({ rows }: { rows: ProjectTableRow[] }) {
  // Legacy: projects created before one-per-unit architecture may have multiple units in
  // description — expand those into separate display rows for backward compatibility.
  const expandedRows = rows.flatMap((row) => {
    const units = unitsFromDescription(row);
    if (!units) return [row];
    const unitList = units.split(", ");
    if (unitList.length <= 1) return [row];
    const rawLine = getDetailLine(row.description, "Units") || getDetailLine(row.description, "Unit Numbers") || "";
    const rawEntries = rawLine.split(/\s+\|\s+/);
    return unitList.map((unit, index) => {
      const isCommonArea = (rawEntries[index] || "").toLowerCase().includes("(common area");
      return {
        ...row,
        id: `${row.id}-unit-${index}`,
        jobTitle: `${row.jobTitle} - ${unit}`,
        description: `Units: ${unit}${isCommonArea ? " (Common Area)" : ""}\n${row.description || ""}`,
      };
    });
  });

  const visibleRows = expandedRows
    .sort((a, b) => {
      const buildingCompare = janitorialBuildingTitle(a).localeCompare(janitorialBuildingTitle(b), undefined, { numeric: true });
      if (buildingCompare !== 0) return buildingCompare;

      const rankCompare = lifecycleRank(a) - lifecycleRank(b);
      if (rankCompare !== 0) return rankCompare;

      return janitorialRowTitle(a).localeCompare(janitorialRowTitle(b), undefined, { numeric: true });
    });

  return (
    <ProjectsExpandableTable
      rows={visibleRows}
      janitorialPipelineId={null}
      groupTitleForRow={janitorialBuildingTitle}
      groupHrefForRow={janitorialBuildingHref}
      collapsibleGroups
      rowTitleForRow={janitorialRowTitle}
      rowDescriptionForRow={janitorialRowDescription}
    />
  );
}
