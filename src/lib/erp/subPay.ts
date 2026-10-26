/**
 * A sub's pay on a turnover or post-con job, typed on the schedule's day
 * card. Pay is flat per visit: the days saved together, plus any days in a
 * row with the same sub on the job. A 3-day visit at $100 pays $100.
 *
 * Each visit's pay is one ContractorAssignment (setOnSchedule) that its days
 * point at (ProjectDayAssignment.subPayAssignmentId). It's the same cost
 * margin, finance and payroll use, so the invite and the job cost match.
 *
 * - A new visit gets its own line; an older visit's pay is never changed.
 * - Pay entered in the project's Contractors tab for those dates is left
 *   alone: the card shows it, and saving doesn't add a second line.
 * - The line is booked on the visit's last day (its endDate), so payroll
 *   pays it once. With no assignedDate/startDate the calendar doesn't count
 *   it as a worked day (see contractorAssignmentDayKeys).
 * - Adding a day next to a visit joins it, a moved day keeps its pay, and a
 *   visit with no days left (sub swapped out or days removed) loses its
 *   pay. syncScheduleSubPay keeps that true after every calendar change.
 * - Nothing typed means no pay line on the invite. No 50% guess.
 */
import { prisma } from "@/lib/prisma";
import { dayKey } from "@/lib/erp/schedule";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Cleans subPayCents from a request body. Undefined when the body didn't send it (leave as is). */
export function subPayFromBody(body: Record<string, unknown>): number | null | undefined {
  if (!("subPayCents" in body)) return undefined;
  const n = Number(body.subPayCents);
  return body.subPayCents == null || body.subPayCents === "" || !Number.isFinite(n) || n < 0 ? null : Math.round(n);
}

type Day = { id: string; date: Date; subPayAssignmentId: string | null };

/** The sub's days on the job that make up one visit: these dates, plus the days in a row on either side. */
async function visitDays(projectId: string, contractorId: string, dates: Date[]): Promise<Day[]> {
  const days = await prisma.projectDayAssignment.findMany({
    where: { projectId, supervisorContractorId: contractorId },
    select: { id: true, date: true, subPayAssignmentId: true },
    orderBy: { date: "asc" },
  });
  const inVisit = new Set(dates.map(dayKey));
  for (let grew = true; grew; ) {
    grew = false;
    for (const d of days) {
      if (inVisit.has(dayKey(d.date))) continue;
      const next = dayKey(new Date(d.date.getTime() + DAY_MS));
      const prev = dayKey(new Date(d.date.getTime() - DAY_MS));
      if (inVisit.has(next) || inVisit.has(prev)) {
        inVisit.add(dayKey(d.date));
        grew = true;
      }
    }
  }
  return days.filter((d) => inVisit.has(dayKey(d.date)));
}

/** A Contractors tab line for this sub whose dates cover one of these days. */
async function tabLineCovering(projectId: string, contractorId: string, days: Date[]) {
  if (days.length === 0) return null;
  return prisma.contractorAssignment.findFirst({
    where: {
      projectId,
      contractorId,
      setOnSchedule: false,
      costCents: { not: null },
      OR: days.map((d) => ({
        OR: [
          { startDate: { lte: d }, endDate: { gte: d } },
          { startDate: d, endDate: null },
          { startDate: null, endDate: d },
          { startDate: null, endDate: null, assignedDate: d },
        ],
      })),
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, costCents: true, startDate: true, endDate: true, assignedDate: true },
  });
}

/**
 * Saves the pay typed for the visit holding these days. "set-elsewhere"
 * when pay for those dates was entered in the Contractors tab, which the
 * calendar doesn't change.
 */
export async function saveSubPay(projectId: string, contractorId: string, costCents: number | null, dates: Date[]): Promise<"saved" | "set-elsewhere"> {
  const days = await visitDays(projectId, contractorId, dates);
  if (days.length === 0) return "saved";
  const linked = await prisma.contractorAssignment.findMany({
    where: { id: { in: days.flatMap((d) => d.subPayAssignmentId ?? []) }, contractorId, setOnSchedule: true },
    select: { id: true },
  });
  const lastDay = days[days.length - 1]!.date;
  if (linked.length > 0) {
    const [keep, ...rest] = linked.map((l) => l.id);
    if (costCents == null) {
      await prisma.contractorAssignment.deleteMany({ where: { id: { in: [keep!, ...rest] } } });
      return "saved";
    }
    await prisma.$transaction([
      prisma.contractorAssignment.update({ where: { id: keep }, data: { costCents, endDate: lastDay } }),
      prisma.projectDayAssignment.updateMany({ where: { id: { in: days.map((d) => d.id) } }, data: { subPayAssignmentId: keep } }),
      // Days that ran together now make one visit, so one pay.
      prisma.contractorAssignment.deleteMany({ where: { id: { in: rest } } }),
    ]);
    return "saved";
  }
  if (await tabLineCovering(projectId, contractorId, days.map((d) => d.date))) return "set-elsewhere";
  if (costCents == null) return "saved";
  const line = await prisma.contractorAssignment.create({
    data: { projectId, contractorId, costCents, endDate: lastDay, role: "Sub", notes: "Pay set on the schedule", setOnSchedule: true },
    select: { id: true },
  });
  await prisma.projectDayAssignment.updateMany({ where: { id: { in: days.map((d) => d.id) } }, data: { subPayAssignmentId: line.id } });
  return "saved";
}

/**
 * Days saved without a pay amount (a drag, an added day, a role that can't
 * see prices) keep or join a visit's pay: a moved day takes the pay of the
 * day it moved from, and a day next to a visit joins it.
 */
export async function joinSubPayVisit(projectId: string, contractorId: string, dates: Date[], movedFromLineId: string | null): Promise<void> {
  const days = await visitDays(projectId, contractorId, dates);
  if (days.some((d) => dates.some((x) => x.getTime() === d.date.getTime()) && d.subPayAssignmentId)) return;
  const lineId = movedFromLineId ?? days.find((d) => d.subPayAssignmentId)?.subPayAssignmentId ?? null;
  if (!lineId) return;
  const line = await prisma.contractorAssignment.findFirst({ where: { id: lineId, contractorId, setOnSchedule: true }, select: { id: true } });
  if (!line) return;
  await prisma.projectDayAssignment.updateMany({ where: { id: { in: days.map((d) => d.id) }, subPayAssignmentId: null }, data: { subPayAssignmentId: line.id } });
}

/**
 * Run after any change to a project's calendar days. Each visit's pay is
 * booked on its last day; a day now run by a different sub leaves the
 * visit; a visit with no days left loses its pay, so a sub who's swapped
 * out isn't still paid.
 */
export async function syncScheduleSubPay(projectId: string): Promise<void> {
  const lines = await prisma.contractorAssignment.findMany({
    where: { projectId, setOnSchedule: true },
    select: { id: true, contractorId: true, endDate: true, subPayDays: { select: { id: true, date: true, supervisorContractorId: true } } },
  });
  for (const line of lines) {
    const stray = line.subPayDays.filter((d) => d.supervisorContractorId !== line.contractorId);
    if (stray.length > 0) await prisma.projectDayAssignment.updateMany({ where: { id: { in: stray.map((d) => d.id) } }, data: { subPayAssignmentId: null } });
    const days = line.subPayDays.filter((d) => d.supervisorContractorId === line.contractorId);
    if (days.length === 0) {
      await prisma.contractorAssignment.delete({ where: { id: line.id } });
      continue;
    }
    const last = days.reduce((m, d) => (d.date > m ? d.date : m), days[0]!.date);
    if (line.endDate?.getTime() !== last.getTime()) await prisma.contractorAssignment.update({ where: { id: line.id }, data: { endDate: last } });
  }
}

/** The pay a sub's invite shows for one day: its visit's calendar pay, else a Contractors tab line covering the day. */
export async function subPayForDay(dayId: string, contractorId: string): Promise<{ cents: number; from: Date; to: Date } | null> {
  const day = await prisma.projectDayAssignment.findUnique({
    where: { id: dayId },
    select: { projectId: true, date: true, subPayAssignment: { select: { contractorId: true, costCents: true, subPayDays: { select: { date: true } } } } },
  });
  if (!day) return null;
  const line = day.subPayAssignment;
  if (line && line.contractorId === contractorId && line.costCents != null) {
    const dates = line.subPayDays.map((d) => d.date.getTime());
    return { cents: line.costCents, from: new Date(Math.min(...dates)), to: new Date(Math.max(...dates)) };
  }
  const tab = await tabLineCovering(day.projectId, contractorId, [day.date]);
  if (!tab?.costCents) return null;
  const from = tab.startDate ?? tab.assignedDate ?? tab.endDate ?? day.date;
  return { cents: tab.costCents, from, to: tab.endDate ?? from };
}
