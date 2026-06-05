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

function janitorialRowTitle(row: ProjectTableRow) {
  const units = getDetailLine(row.description, "Units") || getDetailLine(row.description, "Unit Numbers");
  const unitScope = units.match(/\)\s*-\s*(.+)$/)?.[1]?.trim();
  const firstUnit = units.split(",")[0]?.replace(/^\s*\d+\s+unit[s]?\s*\([^)]*\)\s*-\s*/i, "").trim();

  if (unitScope) return unitScope;
  if (firstUnit) return firstUnit;

  const unitFromTitle = row.jobTitle.match(/\bUnit\b.+$/i)?.[0]?.trim();
  if (unitFromTitle) return unitFromTitle;

  return row.jobTitle;
}

function janitorialBuildingTitle(row: ProjectTableRow) {
  return getDetailLine(row.description, "Property") || row.jobTitle.split(/\s+-\s+Unit\b/i)[0]?.trim() || row.jobTitle;
}

function janitorialRowDescription(row: ProjectTableRow) {
  const description = row.description?.trim();
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

      return janitorialRowTitle(a).localeCompare(janitorialRowTitle(b));
    });

  return (
    <ProjectsExpandableTable
      rows={visibleRows}
      janitorialPipelineId={null}
      janitorialDetailMode="team"
      groupTitleForRow={janitorialBuildingTitle}
      collapsibleGroups
      rowTitleForRow={janitorialRowTitle}
      rowDescriptionForRow={janitorialRowDescription}
    />
  );
}
