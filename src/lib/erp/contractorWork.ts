/**
 * A contractor's work history for their profile (Work history section and
 * GET /api/erp/contractor-labor, so the first page, "Load more" and the CSV
 * agree). Their work lives in two tables, same split as Employee's
 * LaborEntry vs ProjectChangeOrderLaborer: ContractorAssignment for
 * project/building-level work, ChangeOrderContractorAssignment for CO work.
 *
 * Each row's building is the line's own building, else its project's (a
 * change order uses its project's building).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ContractorWorkSort = "date" | "building";

export type ContractorWorkFilters = {
  contractorId: string;
  projectId?: string | null;
  buildingId?: string | null;
  /** "YYYY-MM-DD", inclusive, on the row's shown date */
  startDate?: string | null;
  endDate?: string | null;
  sort?: ContractorWorkSort;
};

export type ContractorWorkRow = {
  id: string;
  source: "PROJECT" | "CHANGE_ORDER";
  projectId: string | null;
  projectTitle: string | null;
  buildingId: string | null;
  buildingName: string | null;
  changeOrderTitle: string | null;
  role: string | null;
  date: Date | null;
  endDate: Date | null;
  costCents: number | null;
  taskDescription: string | null;
  createdAt: Date;
  /** Pay hold from the Payroll page or profile (subPayHold.ts) */
  payHeldAt: Date | null;
  payHoldNote: string | null;
  payReleasedAt: Date | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const buildingSelect = { select: { id: true, name: true } } as const;

/** Every matching row, sorted newest first, or by building name (A to Z, no building last) then newest first. */
export async function loadContractorWork(f: ContractorWorkFilters): Promise<ContractorWorkRow[]> {
  let dateFilter: Prisma.DateTimeFilter | undefined;
  if (f.startDate || f.endDate) {
    dateFilter = {
      ...(f.startDate ? { gte: new Date(f.startDate) } : {}),
      ...(f.endDate ? { lt: new Date(new Date(f.endDate).getTime() + DAY_MS) } : {}),
    };
  }
  // The date each row is shown with: start date, else assigned date, else
  // end date (pay set on the schedule only has an end date, see subPay.ts).
  const shownDateIn = (d: Prisma.DateTimeFilter) => [
    { startDate: d },
    { startDate: null, assignedDate: d },
    { startDate: null, assignedDate: null, endDate: d },
  ];

  const where: Prisma.ContractorAssignmentWhereInput = { contractorId: f.contractorId };
  if (f.projectId) where.projectId = f.projectId;
  if (dateFilter) where.OR = shownDateIn(dateFilter);

  const coWhere: Prisma.ChangeOrderContractorAssignmentWhereInput = { contractorId: f.contractorId };
  if (f.projectId) coWhere.changeOrder = { projectId: f.projectId };
  if (dateFilter) coWhere.OR = shownDateIn(dateFilter);

  const [rows, coRows] = await Promise.all([
    prisma.contractorAssignment.findMany({
      where,
      select: {
        id: true, role: true, startDate: true, endDate: true, assignedDate: true, costCents: true,
        taskDescription: true, createdAt: true, payHeldAt: true, payHoldNote: true, payReleasedAt: true,
        project: { select: { id: true, jobTitle: true, building: buildingSelect } },
        building: buildingSelect,
      },
    }),
    prisma.changeOrderContractorAssignment.findMany({
      where: coWhere,
      select: {
        id: true, role: true, startDate: true, endDate: true, assignedDate: true, costCents: true,
        notes: true, createdAt: true, payHeldAt: true, payHoldNote: true, payReleasedAt: true,
        changeOrder: { select: { title: true, project: { select: { id: true, jobTitle: true, building: buildingSelect } } } },
      },
    }),
  ]);

  let combined: ContractorWorkRow[] = [
    ...rows.map((r) => {
      const building = r.building ?? r.project?.building ?? null;
      return {
        id: r.id,
        source: "PROJECT" as const,
        projectId: r.project?.id ?? null,
        projectTitle: r.project?.jobTitle ?? null,
        buildingId: building?.id ?? null,
        buildingName: building?.name ?? null,
        changeOrderTitle: null,
        role: r.role,
        // Older rows only have assignedDate; pay set on the schedule only has an end date.
        date: r.startDate ?? r.assignedDate ?? r.endDate,
        endDate: r.endDate,
        costCents: r.costCents,
        taskDescription: r.taskDescription,
        createdAt: r.createdAt,
        payHeldAt: r.payHeldAt,
        payHoldNote: r.payHoldNote,
        payReleasedAt: r.payReleasedAt,
      };
    }),
    ...coRows.map((r) => {
      const building = r.changeOrder.project.building;
      return {
        id: r.id,
        source: "CHANGE_ORDER" as const,
        projectId: r.changeOrder.project.id,
        projectTitle: r.changeOrder.project.jobTitle,
        buildingId: building?.id ?? null,
        buildingName: building?.name ?? null,
        changeOrderTitle: r.changeOrder.title,
        role: r.role,
        date: r.startDate ?? r.assignedDate ?? r.endDate,
        endDate: r.endDate,
        costCents: r.costCents,
        // ChangeOrderContractorAssignment has no taskDescription, notes is the closest.
        taskDescription: r.notes,
        createdAt: r.createdAt,
        payHeldAt: r.payHeldAt,
        payHoldNote: r.payHoldNote,
        payReleasedAt: r.payReleasedAt,
      };
    }),
  ];

  if (f.buildingId === "none") combined = combined.filter((r) => !r.buildingId);
  else if (f.buildingId) combined = combined.filter((r) => r.buildingId === f.buildingId);

  const newestFirst = (a: ContractorWorkRow, b: ContractorWorkRow) =>
    (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0) || b.createdAt.getTime() - a.createdAt.getTime();
  const byBuilding = (a: ContractorWorkRow, b: ContractorWorkRow) => {
    if (!a.buildingName !== !b.buildingName) return a.buildingName ? -1 : 1;
    return (a.buildingName ?? "").localeCompare(b.buildingName ?? "") || newestFirst(a, b);
  };
  return combined.sort(f.sort === "building" ? byBuilding : newestFirst);
}

/** The buildings in a contractor's work, A to Z, for the Building filter. */
export function workBuildingOptions(rows: ContractorWorkRow[]): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const r of rows) if (r.buildingId && r.buildingName) seen.set(r.buildingId, r.buildingName);
  return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Totals for the rows matching the filters, shown under the work history. */
export function workTotals(rows: ContractorWorkRow[]) {
  let totalCents = 0, heldCents = 0;
  for (const r of rows) {
    totalCents += r.costCents ?? 0;
    if (r.payHeldAt && !r.payReleasedAt) heldCents += r.costCents ?? 0;
  }
  return { count: rows.length, totalCents, heldCents };
}

export type ContractorWorkTotals = ReturnType<typeof workTotals>;

/** A row as sent to the browser. */
export function workRowJson(r: ContractorWorkRow) {
  return {
    id: r.id,
    source: r.source,
    projectId: r.projectId,
    projectTitle: r.projectTitle,
    buildingId: r.buildingId,
    buildingName: r.buildingName,
    changeOrderTitle: r.changeOrderTitle,
    role: r.role,
    date: r.date?.toISOString() ?? null,
    endDate: r.endDate?.toISOString() ?? null,
    costCents: r.costCents,
    taskDescription: r.taskDescription,
    /** HELD (out of payroll), RELEASED (paid on releasedOn) or null */
    hold: r.payHeldAt ? (r.payReleasedAt ? ("RELEASED" as const) : ("HELD" as const)) : null,
    holdNote: r.payHoldNote,
    releasedOn: r.payReleasedAt?.toISOString().slice(0, 10) ?? null,
  };
}
