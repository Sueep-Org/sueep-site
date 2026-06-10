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
  if (units) return `${units} - Turnover request`;

  const buildingTitle = janitorialBuildingTitle(row);
  const withoutBuilding = row.jobTitle.replace(new RegExp(`^${buildingTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*-\\s*`, "i"), "").trim();
  if (withoutBuilding && withoutBuilding !== row.jobTitle) return `${withoutBuilding} - Turnover request`;

  return "Turnover request";
}

function janitorialRowDescription(row: ProjectTableRow) {
  const description = row.description?.trim();
  const unitDetails = getDetailLine(row.description, "Units") || getDetailLine(row.description, "Unit Numbers");
  if (unitDetails) return unitDetails;

  const firstLine = description?.split(/\r?\n/).find((line) => line.trim())?.trim();

  if (!firstLine) return null;
  if (/^(property|address|units|unit numbers|price package|estimated turnover total|pricing breakdown):/i.test(firstLine)) {
    return null;
  }

  return firstLine;
}

export function JanitorialProjectsExpandableTable({ rows }: { rows: ProjectTableRow[] }) {
  const visibleRows = rows
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
