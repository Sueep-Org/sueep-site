/**
 * A sub's pay on a turnover, typed on the schedule's day card. Lives on the
 * project's ContractorAssignment cost (the same number margin, finance and
 * payroll use), so the invite and the job cost always match.
 *
 * - Edits the newest ContractorAssignment for that project + contractor, or
 *   makes one when there isn't any.
 * - A new row only gets endDate (the work day): payroll and finance book the
 *   cost on that day, but with no assignedDate/startDate the calendar doesn't
 *   count it as a worked day (see contractorAssignmentDayKeys).
 * - Nothing typed means no pay line on the invite. No 50% guess.
 */
import { prisma } from "@/lib/prisma";

export async function getSubPayCents(projectId: string, contractorId: string): Promise<number | null> {
  const row = await prisma.contractorAssignment.findFirst({
    where: { projectId, contractorId, costCents: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { costCents: true },
  });
  return row?.costCents ?? null;
}

/** Cleans subPayCents from a request body. Undefined when the body didn't send it (leave as is). */
export function subPayFromBody(body: Record<string, unknown>): number | null | undefined {
  if (!("subPayCents" in body)) return undefined;
  const n = Number(body.subPayCents);
  return body.subPayCents == null || body.subPayCents === "" || !Number.isFinite(n) || n < 0 ? null : Math.round(n);
}

export async function saveSubPay(projectId: string, contractorId: string, costCents: number | null, workDay: Date): Promise<void> {
  const row = await prisma.contractorAssignment.findFirst({
    where: { projectId, contractorId },
    orderBy: { createdAt: "desc" },
    select: { id: true, costCents: true },
  });
  if (row) {
    if (row.costCents !== costCents) await prisma.contractorAssignment.update({ where: { id: row.id }, data: { costCents } });
    return;
  }
  if (costCents == null) return;
  await prisma.contractorAssignment.create({
    data: { projectId, contractorId, costCents, endDate: workDay, role: "Sub", notes: "Pay set on the schedule" },
  });
}
