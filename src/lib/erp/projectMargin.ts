import { calcOtSplits, otLineCents, type OtEntry, type OtSplit } from "./calcOtSplits";

type LaborLine = OtEntry & { hourlyRateCents: number };

function otAwareLaborCents(entries: LaborLine[], otSplits: Map<string, OtSplit>): number {
  return entries.reduce((s, e) => {
    const split = otSplits.get(e.id) ?? { regHours: e.hours, otHours: 0 };
    return s + otLineCents(split.regHours, split.otHours, e.hourlyRateCents);
  }, 0);
}

export type ProjectMarginInput = {
  id: string;
  contractValueCents: number | null;
  /** Manual fallback fields, used only when there's no labor/material log data. */
  actualLaborCents: number | null;
  actualMaterialCents: number | null;
  laborEntries: LaborLine[];
  materialEntries: { costCents: number }[];
  contractorAssignments: { costCents: number | null }[];
};

export type ProjectMargin = { actualLaborCents: number; actualMaterialCents: number; marginCents: number | null };

/**
 * Same cost methodology as the Projects table (OT-aware labor + contractor
 * cost, falling back to manually-entered totals when there's no log data) —
 * kept here so margin-based commission and the Projects table never disagree
 * on what a project's actual cost is. Scoped to base projects only, not
 * change orders, since commission is tracked per deal/project.
 */
export async function computeProjectMargins(projects: ProjectMarginInput[]): Promise<Map<string, ProjectMargin>> {
  const otSplits = await calcOtSplits(projects.flatMap((p) => p.laborEntries));
  const result = new Map<string, ProjectMargin>();
  for (const p of projects) {
    const laborCents = otAwareLaborCents(p.laborEntries, otSplits);
    const materialCents = p.materialEntries.reduce((s, e) => s + e.costCents, 0);
    const contractorCostCents = p.contractorAssignments.reduce((s, a) => s + (a.costCents ?? 0), 0);
    const actualLaborCents = (p.laborEntries.length > 0 ? laborCents : (p.actualLaborCents ?? 0)) + contractorCostCents;
    const actualMaterialCents = p.materialEntries.length > 0 ? materialCents : (p.actualMaterialCents ?? 0);
    const marginCents =
      p.contractValueCents == null ? null : p.contractValueCents - (actualLaborCents + actualMaterialCents);
    result.set(p.id, { actualLaborCents, actualMaterialCents, marginCents });
  }
  return result;
}
