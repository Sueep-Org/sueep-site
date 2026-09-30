import { costLaborLogs, sumLineCosts, type LineCost } from "./laborCost";

type LaborLine = {
  id: string;
  employeeId: string | null;
  workDate: Date;
  createdAt: Date;
  hours: number;
  hourlyRateCents: number;
  workerName?: string | null;
};

type ChangeOrderLine = {
  status: string;
  contractValueCents: number | null;
  estimatedCostCents: number | null;
  actualLaborCents: number | null;
  actualMaterialCents: number | null;
  actualTravelCents?: number | null;
  materialEntries: { costCents: number }[];
  laborers: LaborLine[];
  contractorAssignments: { costCents: number | null }[];
};

export type ProjectActualsInput = {
  id: string;
  contractValueCents: number | null;
  /** Typed-in totals, used only when there are no labor/material logs. */
  actualLaborCents: number | null;
  actualMaterialCents: number | null;
  /** Typed-in travel cost (there's no travel log, so this always counts). */
  actualTravelCents?: number | null;
  laborEntries: LaborLine[];
  materialEntries: { costCents: number }[];
  contractorAssignments: { costCents: number | null }[];
  changeOrders: ChangeOrderLine[];
};

export type ProjectActuals = {
  /** Project plus qualifying change orders. */
  contractValueCents: number | null;
  /** Labor (logs, or the typed-in total when there are none) plus contractors, change orders included. */
  actualLaborCents: number;
  actualMaterialCents: number;
  actualTravelCents: number;
  marginCents: number | null;
  /** The base project alone, before change orders. */
  base: {
    laborCents: number;
    /** False when the typed-in labor total was used because there are no labor logs. */
    laborFromLogs: boolean;
    contractorCents: number;
    materialCents: number;
    materialFromLogs: boolean;
    travelCents: number;
  };
};

/** A change order counts unless it was voided or rejected. */
export function isQualifyingChangeOrder(co: { status: string }): boolean {
  return co.status !== "VOID" && co.status !== "REJECTED";
}

/** A change order's price, or its estimate until a price is set. */
export function changeOrderValueCents(co: { contractValueCents: number | null; estimatedCostCents: number | null }): number {
  return co.contractValueCents ?? co.estimatedCostCents ?? 0;
}

export type ChangeOrderActuals = {
  valueCents: number;
  /** Labor (logs, or the typed-in total when there are none) plus contractors. */
  laborCents: number;
  /** Part of laborCents: contractor assignments. */
  contractorCents: number;
  /** False when the typed-in labor total was used because there are no labor logs. */
  laborFromLogs: boolean;
  materialCents: number;
  travelCents: number;
};

/** One change order's value and actual cost, by the same rules as its
 * project (so the pieces always add up to computeProjectActualsWithChangeOrders). */
export function changeOrderActuals(co: ChangeOrderLine, costs: Map<string, LineCost>): ChangeOrderActuals {
  const laborFromLogs = co.laborers.length > 0;
  const labor = laborFromLogs ? sumLineCosts(co.laborers, costs) : (co.actualLaborCents ?? 0);
  const contractorCents = co.contractorAssignments.reduce((s, a) => s + (a.costCents ?? 0), 0);
  return {
    valueCents: changeOrderValueCents(co),
    laborCents: labor + contractorCents,
    contractorCents,
    laborFromLogs,
    materialCents: co.materialEntries.length > 0 ? co.materialEntries.reduce((s, e) => s + e.costCents, 0) : (co.actualMaterialCents ?? 0),
    travelCents: co.actualTravelCents ?? 0,
  };
}

/**
 * The one definition of a project's actual cost and margin: labor priced by
 * the shared labor cost rule (laborCost.ts), contractor cost, materials, and
 * travel, with qualifying change orders rolled into both value and cost.
 * Typed-in labor/material totals are only used when there are no logs.
 *
 * The Projects table, project and change order pages, dashboard, commission
 * and the Finance tab all read this, so they can't disagree on a project's
 * margin. Pass `lineCosts` when the caller already costed these logs with
 * costLaborLogs (to avoid doing it twice).
 */
export async function computeProjectActualsWithChangeOrders(
  projects: ProjectActualsInput[],
  lineCosts?: Map<string, LineCost>,
): Promise<Map<string, ProjectActuals>> {
  const costs =
    lineCosts ??
    (await costLaborLogs(
      projects.flatMap((p) => p.laborEntries),
      projects.flatMap((p) => p.changeOrders.flatMap((co) => co.laborers)),
    ));

  const result = new Map<string, ProjectActuals>();
  for (const p of projects) {
    const laborFromLogs = p.laborEntries.length > 0;
    const materialFromLogs = p.materialEntries.length > 0;
    const contractorCents = p.contractorAssignments.reduce((s, a) => s + (a.costCents ?? 0), 0);
    const base = {
      laborCents: laborFromLogs ? sumLineCosts(p.laborEntries, costs) : (p.actualLaborCents ?? 0),
      laborFromLogs,
      contractorCents,
      materialCents: materialFromLogs ? p.materialEntries.reduce((s, e) => s + e.costCents, 0) : (p.actualMaterialCents ?? 0),
      materialFromLogs,
      travelCents: p.actualTravelCents ?? 0,
    };

    const qualifyingCOs = p.changeOrders.filter(isQualifyingChangeOrder);
    const coContractValueCents = qualifyingCOs.reduce((s, co) => s + changeOrderValueCents(co), 0);
    let coLaborCents = 0;
    let coMaterialCents = 0;
    let coTravelCents = 0;
    for (const co of qualifyingCOs) {
      const c = changeOrderActuals(co, costs);
      coLaborCents += c.laborCents;
      coMaterialCents += c.materialCents;
      coTravelCents += c.travelCents;
    }

    const contractValueCents =
      p.contractValueCents == null && coContractValueCents === 0 ? null : (p.contractValueCents ?? 0) + coContractValueCents;
    const actualLaborCents = base.laborCents + base.contractorCents + coLaborCents;
    const actualMaterialCents = base.materialCents + coMaterialCents;
    const actualTravelCents = base.travelCents + coTravelCents;
    const marginCents = contractValueCents == null ? null : contractValueCents - (actualLaborCents + actualMaterialCents + actualTravelCents);

    result.set(p.id, { contractValueCents, actualLaborCents, actualMaterialCents, actualTravelCents, marginCents, base });
  }
  return result;
}
