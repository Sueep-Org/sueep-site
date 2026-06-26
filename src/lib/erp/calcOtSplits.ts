import { prisma } from "@/lib/prisma";

const OT_THRESHOLD = 40;
const OT_MULTIPLIER = 1.5;

export const OT_RATE = OT_MULTIPLIER;

function mondayOf(d: Date): string {
  const date = new Date(d);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

export type OtSplit = { regHours: number; otHours: number };

export type OtEntry = {
  id: string;
  employeeId: string | null;
  workDate: Date;
  hours: number;
  createdAt: Date;
};

export function otLineCents(regHours: number, otHours: number, rateCents: number): number {
  return Math.round(regHours * rateCents + otHours * rateCents * OT_MULTIPLIER);
}

/**
 * Given a set of labor entries from the current view, fetches all labor for those
 * employees across all projects/COs in the same weeks, then returns the reg/OT
 * split for each entry in the view (keyed by entry id).
 */
export async function calcOtSplits(viewEntries: OtEntry[]): Promise<Map<string, OtSplit>> {
  const result = new Map<string, OtSplit>();
  if (viewEntries.length === 0) return result;

  const viewIds = new Set(viewEntries.map((e) => e.id));
  const employeeIds = [
    ...new Set(viewEntries.filter((e) => e.employeeId).map((e) => e.employeeId!)),
  ];

  if (employeeIds.length === 0) {
    for (const e of viewEntries) result.set(e.id, { regHours: e.hours, otHours: 0 });
    return result;
  }

  const timestamps = viewEntries.map((e) => e.workDate.getTime());
  const minWeekStart = mondayOf(new Date(Math.min(...timestamps)));
  const maxWeekMonday = new Date(`${mondayOf(new Date(Math.max(...timestamps)))}T00:00:00Z`);
  maxWeekMonday.setUTCDate(maxWeekMonday.getUTCDate() + 6);
  maxWeekMonday.setUTCHours(23, 59, 59, 999);
  const minDate = new Date(`${minWeekStart}T00:00:00Z`);

  const [projectEntries, coEntries] = await Promise.all([
    prisma.laborEntry.findMany({
      where: {
        employeeId: { in: employeeIds },
        workDate: { gte: minDate, lte: maxWeekMonday },
      },
      select: { id: true, employeeId: true, workDate: true, hours: true, createdAt: true },
    }),
    prisma.projectChangeOrderLaborer.findMany({
      where: {
        employeeId: { in: employeeIds },
        workDate: { gte: minDate, lte: maxWeekMonday },
      },
      select: { id: true, employeeId: true, workDate: true, hours: true, createdAt: true },
    }),
  ]);

  type BucketEntry = { id: string; hours: number; workDate: Date; createdAt: Date };
  const buckets = new Map<string, BucketEntry[]>();

  for (const e of [...projectEntries, ...coEntries]) {
    if (!e.employeeId) continue;
    const key = `${e.employeeId}::${mondayOf(e.workDate)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push({ id: e.id, hours: e.hours, workDate: e.workDate, createdAt: e.createdAt });
  }

  for (const bucket of buckets.values()) {
    bucket.sort((a, b) =>
      a.workDate.getTime() !== b.workDate.getTime()
        ? a.workDate.getTime() - b.workDate.getTime()
        : a.createdAt.getTime() - b.createdAt.getTime()
    );
    let cumulative = 0;
    for (const entry of bucket) {
      const reg = Math.max(0, Math.min(entry.hours, OT_THRESHOLD - cumulative));
      const ot = entry.hours - reg;
      if (viewIds.has(entry.id)) result.set(entry.id, { regHours: reg, otHours: ot });
      cumulative += entry.hours;
    }
  }

  for (const e of viewEntries) {
    if (!result.has(e.id)) result.set(e.id, { regHours: e.hours, otHours: 0 });
  }

  return result;
}
