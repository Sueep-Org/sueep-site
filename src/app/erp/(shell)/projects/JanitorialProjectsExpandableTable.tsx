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

function janitorialBuildingTitle(row: ProjectTableRow) {
  return row.buildingName || getDetailLine(row.description, "Property") || row.jobTitle.split(/\s+-\s+Unit\b/i)[0]?.trim() || row.jobTitle;
}

function janitorialBuildingHref(row: ProjectTableRow) {
  return row.buildingId ? `/erp/buildings/${row.buildingId}` : null;
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
  if (units) return `Unit ${units}`;
  // Fall back to stripping the building prefix from job title
  const buildingName = row.buildingName || getDetailLine(row.description, "Property");
  if (buildingName && row.jobTitle.toLowerCase().startsWith(buildingName.toLowerCase())) {
    return row.jobTitle.slice(buildingName.length).replace(/^\s*[-–]\s*/, "").trim() || row.jobTitle;
  }
  return row.jobTitle;
}

function janitorialRowDescription(_row: ProjectTableRow) {
  return null;
}

export function JanitorialProjectsExpandableTable({ rows }: { rows: ProjectTableRow[] }) {
  // Legacy: projects created before one-per-unit architecture may have multiple units in
  // description — expand those into separate display rows for backward compatibility.
  const expandedRows = rows.flatMap((row) => {
    const units = unitsFromDescription(row);
    if (!units) return [row];
    const unitList = units.split(", ");
    if (unitList.length <= 1) return [row];
    return unitList.map((unit, index) => ({
      ...row,
      id: `${row.id}-unit-${index}`,
      jobTitle: `${row.jobTitle} - Unit ${unit}`,
      description: `Units: ${unit}\n${row.description || ""}`,
    }));
  });

  const visibleRows = expandedRows
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
      rowTitleForRow={janitorialRowTitle}
      rowDescriptionForRow={janitorialRowDescription}
    />
  );
}
