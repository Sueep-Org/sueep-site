/**
 * A sub's pay on a turnover or post-con job, typed on the schedule's day
 * card. It's pay for the whole job, not per day, and lives as one
 * ContractorAssignment cost per sub per project (setOnSchedule), the same
 * number margin, finance and payroll use, so the invite and the job cost
 * always match.
 *
 * - The calendar only edits its own line. Pay entered in the project's
 *   Contractors tab is left alone: the box shows it, and saving doesn't
 *   change it or add a second line on top of it.
 * - The line is booked on the sub's last scheduled day on the project (its
 *   endDate), and goes away when the sub has no days left there (swapped
 *   out or removed). syncScheduleSubPay keeps that true after every change
 *   to the calendar. With no assignedDate/startDate the calendar doesn't
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

/** "set-elsewhere" when the sub's pay was entered in the Contractors tab, which the calendar doesn't change. */
export async function saveSubPay(projectId: string, contractorId: string, costCents: number | null, workDay: Date): Promise<"saved" | "set-elsewhere"> {
  const own = await prisma.contractorAssignment.findFirst({
    where: { projectId, contractorId, setOnSchedule: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, costCents: true },
  });
  if (own) {
    if (costCents == null) await prisma.contractorAssignment.delete({ where: { id: own.id } });
    else if (own.costCents !== costCents) await prisma.contractorAssignment.update({ where: { id: own.id }, data: { costCents } });
    return "saved";
  }
  const elsewhere = await prisma.contractorAssignment.count({ where: { projectId, contractorId, setOnSchedule: false, costCents: { not: null } } });
  if (elsewhere > 0) return "set-elsewhere";
  if (costCents == null) return "saved";
  // Dated to this day for now; syncScheduleSubPay moves it to the sub's last day.
  await prisma.contractorAssignment.create({
    data: { projectId, contractorId, costCents, endDate: workDay, role: "Sub", notes: "Pay set on the schedule", setOnSchedule: true },
  });
  return "saved";
}

/**
 * Run after any change to a project's calendar days. Books each sub's
 * calendar pay on their last day on the project, and removes it once they
 * have no days left there, so a sub who's swapped out isn't still paid.
 */
export async function syncScheduleSubPay(projectId: string): Promise<void> {
  const rows = await prisma.contractorAssignment.findMany({
    where: { projectId, setOnSchedule: true },
    select: { id: true, contractorId: true, endDate: true },
  });
  if (rows.length === 0) return;
  const days = await prisma.projectDayAssignment.findMany({
    where: { projectId, supervisorContractorId: { in: rows.map((r) => r.contractorId) } },
    select: { supervisorContractorId: true, date: true },
  });
  const lastDay = new Map<string, Date>();
  for (const d of days) {
    const prev = lastDay.get(d.supervisorContractorId!);
    if (!prev || d.date > prev) lastDay.set(d.supervisorContractorId!, d.date);
  }
  for (const r of rows) {
    const last = lastDay.get(r.contractorId);
    if (!last) await prisma.contractorAssignment.delete({ where: { id: r.id } });
    else if (r.endDate?.getTime() !== last.getTime()) await prisma.contractorAssignment.update({ where: { id: r.id }, data: { endDate: last } });
  }
}
