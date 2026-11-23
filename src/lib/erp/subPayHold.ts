/**
 * Holding a sub's pay by hand on the Payroll page, e.g. a line that wasn't
 * paid out when it should have been.
 *
 * - Hold: the line leaves payroll (any period, past ones too) and shows in
 *   the On hold list on every period until it's released.
 * - Release: it's paid in the period holding the release date (today unless
 *   another date is picked). Its own date and job cost don't change.
 * - Hold again after a release puts it back on hold.
 *
 * A line is a ContractorAssignment ("project") or a
 * ChangeOrderContractorAssignment ("co"), same split as payrollRows.ts.
 */
import { prisma } from "@/lib/prisma";

export type SubPayLineKind = "project" | "co";

export type HeldSubPayLine = {
  id: string;
  kind: SubPayLineKind;
  contractorId: string;
  contractorName: string;
  projectId: string | null;
  title: string;
  role: string | null;
  amountCents: number;
  /** The line's own pay date, "YYYY-MM-DD" */
  date: string | null;
  heldAt: string;
  heldBy: string | null;
  note: string | null;
};

const dayOf = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

/** Every line on hold and not released, oldest first. */
export async function loadHeldSubPay(): Promise<HeldSubPayLine[]> {
  const where = { costCents: { not: null }, payHeldAt: { not: null }, payReleasedAt: null };
  const [lines, coLines] = await Promise.all([
    prisma.contractorAssignment.findMany({
      where,
      include: { contractor: { select: { name: true } }, project: { select: { jobTitle: true } } },
    }),
    prisma.changeOrderContractorAssignment.findMany({
      where,
      include: {
        contractor: { select: { name: true } },
        changeOrder: { select: { title: true, project: { select: { id: true, jobTitle: true } } } },
      },
    }),
  ]);
  const held: HeldSubPayLine[] = [
    ...lines.map((a) => ({
      id: a.id, kind: "project" as const, contractorId: a.contractorId, contractorName: a.contractor.name,
      projectId: a.projectId, title: a.project?.jobTitle ?? "No project", role: a.role, amountCents: a.costCents ?? 0,
      date: dayOf(a.endDate ?? a.startDate ?? a.assignedDate), heldAt: a.payHeldAt!.toISOString(), heldBy: a.payHeldBy, note: a.payHoldNote,
    })),
    ...coLines.map((a) => ({
      id: a.id, kind: "co" as const, contractorId: a.contractorId, contractorName: a.contractor.name,
      projectId: a.changeOrder.project?.id ?? null, title: `${a.changeOrder.project?.jobTitle ?? ""} · CO: ${a.changeOrder.title}`,
      role: a.role, amountCents: a.costCents ?? 0,
      date: dayOf(a.endDate ?? a.startDate ?? a.assignedDate), heldAt: a.payHeldAt!.toISOString(), heldBy: a.payHeldBy, note: a.payHoldNote,
    })),
  ];
  return held.sort((x, y) => (x.date ?? "").localeCompare(y.date ?? "") || x.contractorName.localeCompare(y.contractorName));
}

type HoldData = {
  payHeldAt?: Date | null; payHeldBy?: string | null; payHoldNote?: string | null;
  payReleasedAt?: Date | null; payReleasedBy?: string | null;
};

async function updateLine(kind: SubPayLineKind, id: string, data: HoldData): Promise<boolean> {
  const where = { id, costCents: { not: null } };
  const res = kind === "co"
    ? await prisma.changeOrderContractorAssignment.updateMany({ where, data })
    : await prisma.contractorAssignment.updateMany({ where, data });
  return res.count === 1;
}

/** Puts a pay line on hold (again, if it was released). False when there's no such line with pay. */
export function holdSubPay(kind: SubPayLineKind, id: string, by: string, note: string | null) {
  return updateLine(kind, id, { payHeldAt: new Date(), payHeldBy: by, payHoldNote: note, payReleasedAt: null, payReleasedBy: null });
}

/** Releases a held line into the period holding payDate (UTC-midnight date label). */
export async function releaseSubPay(kind: SubPayLineKind, id: string, by: string, payDate: Date): Promise<boolean> {
  const where = { id, payHeldAt: { not: null } };
  const data = { payReleasedAt: payDate, payReleasedBy: by };
  const res = kind === "co"
    ? await prisma.changeOrderContractorAssignment.updateMany({ where, data })
    : await prisma.contractorAssignment.updateMany({ where, data });
  return res.count === 1;
}
