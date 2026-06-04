"use client";

import { ProjectsExpandableTable, type ProjectTableRow } from "./ProjectsExpandableTable";

export function JanitorialProjectsExpandableTable({ rows }: { rows: ProjectTableRow[] }) {
  return (
    <ProjectsExpandableTable
      rows={rows}
      janitorialPipelineId={null}
      janitorialDetailMode="team"
    />
  );
}
