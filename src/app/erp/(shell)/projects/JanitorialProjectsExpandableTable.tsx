"use client";

import { ProjectsExpandableTable, type ProjectTableRow } from "./ProjectsExpandableTable";

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

function isCleanupRow(row: ProjectTableRow) {
  const title = row.jobTitle.trim().toLowerCase();
  const pm = (row.supervisor || "").trim().toLowerCase();

  return title.includes("test") || pm.includes("jeff");
}

function janitorialBuildingTitle(row: ProjectTableRow) {
  return getDetailLine(row.description, "Property") || row.jobTitle.split(/\s+-\s+Unit\b/i)[0]?.trim() || row.jobTitle;
}

function janitorialBuildingHref(row: ProjectTableRow) {
  return `/erp/projects/${row.id}`;
}

function unitsFromDescription(row: ProjectTableRow) {
  const units = getDetailLine(row.description, "Units") || getDetailLine(row.description, "Unit Numbers");
  if (!units) return "";

  return units
    .split(/\s+\|\s+|,/)
    .map((unit) => unit.match(/^\s*([^(:|-]+)/)?.[1]?.trim() || "")
    .filter(Boolean)
    .join(", ");
}

function janitorialRowTitle(row: ProjectTableRow) {
  const units = unitsFromDescription(row);
  if (units) {
    return `Unit ${units} - Turnover request`;
  }
  
  return "Turnover request";
}

function janitorialRowDescription(row: ProjectTableRow) {
  const units = unitsFromDescription(row);
  if (units) {
    return "1 unit";
  }

  return null;
}

export function JanitorialProjectsExpandableTable({ rows }: { rows: ProjectTableRow[] }) {
  // Expand rows with multiple units into separate rows
  const expandedRows = rows.flatMap((row) => {
    const units = unitsFromDescription(row);
    if (!units) return [row];
    
    const unitList = units.split(", ");
    if (unitList.length <= 1) return [row];
    
    // Create a separate row for each unit
    return unitList.map((unit, index) => ({
      ...row,
      id: `${row.id}-unit-${index}`,
      jobTitle: `${row.jobTitle} - Unit ${unit}`,
      description: `Units: ${unit}\n${row.description || ""}`,
    }));
  });

  const visibleRows = expandedRows
    .filter((row) => !isCleanupRow(row))
    .sort((a, b) => {
      const buildingCompare = janitorialBuildingTitle(a).localeCompare(janitorialBuildingTitle(b));
      if (buildingCompare !== 0) return buildingCompare;

      return a.jobTitle.localeCompare(b.jobTitle);
    });

  return (
    <ProjectsExpandableTable
      rows={visibleRows}
      janitorialPipelineId={null}
      groupTitleForRow={janitorialBuildingTitle}
      groupHrefForRow={janitorialBuildingHref}
      collapsibleGroups
      groupsDefaultOpen
      rowTitleForRow={janitorialRowTitle}
      rowDescriptionForRow={janitorialRowDescription}
    />
  );
}
