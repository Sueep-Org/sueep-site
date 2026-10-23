import { buildCsv, downloadCsv, type CsvColumn } from "@/lib/erp/csv";
import type { BoardCard, BoardColumn } from "@/lib/erp/pipelineBoard";

/** Download what the board shows (after filters) as a spreadsheet. */
export function exportDeals(rows: BoardCard[], columns: BoardColumn[], pipeline: "post-con" | "janitorial", flagOf: (c: BoardCard) => string) {
  const stage = new Map(columns.map((c) => [c.stageId, c.label]));
  const dollars = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2));
  const cols: CsvColumn<BoardCard>[] = [
    { header: "Deal", get: (c) => c.name },
    { header: "Stage", get: (c) => stage.get(c.stageId) ?? "" },
    { header: "Owner", get: (c) => c.owner },
    { header: pipeline === "janitorial" ? "Company" : "GC", get: (c) => c.gc?.label },
    { header: "Amount", get: (c) => dollars(c.cents || null) },
    { header: "Chance to win", get: (c) => (c.chance ? `${Math.round(c.chance.p * 100)}%` : "") },
    { header: "Likely", get: (c) => (c.chance ? dollars(Math.round(c.cents * c.chance.p)) : "") },
    { header: "Priority", get: (c) => c.priority ?? "" },
    { header: "Bid date", get: (c) => c.bidDate },
    { header: "Job walk date", get: (c) => c.walkDate },
    { header: "Award date", get: (c) => c.awardDate },
    { header: "Sq ft", get: (c) => c.sqft },
    { header: "Days in stage", get: (c) => c.daysInStage },
    { header: "Next step", get: (c) => c.nextStep?.text },
    { header: "Next step due", get: (c) => c.nextStep?.dueDate },
    { header: "Flag", get: flagOf },
    { header: "Created", get: (c) => c.createdAt.slice(0, 10) },
    { header: "HubSpot link", get: (c) => c.url },
  ];
  const day = new Date().toISOString().slice(0, 10);
  downloadCsv(`deals-${pipeline}-${day}.csv`, buildCsv(cols, rows));
}
