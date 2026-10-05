/**
 * Repeating manual hours on the Payroll page. A repeat is a rule (the first
 * day or date range, the hours, and every 7 or 14 days), and each time it
 * comes around is saved as ordinary ManualHoursEntry rows. That way every
 * repeat is paid, costed, and closed exactly like hours added by hand, and
 * can be edited or removed on its own.
 *
 * Entries are filled in lazily: whenever payroll or labor costs read a date
 * range, every repeat is filled through the end of that range first.
 */
import { prisma } from "@/lib/prisma";
import { utcDateKey } from "@/lib/erp/dates";
import { splitHoursOverWorkingDays } from "@/lib/erp/manualHours";

/** Never fill more than this many times per repeat in one go (a far-future period). */
const MAX_FILL = 120;

export function addDaysKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetweenKeys(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000);
}

/** One time's days and hours: a single day, or a range split over its working days. */
export function occurrenceDays(from: string, to: string, hours: number): { date: string; hours: number }[] {
  if (from === to) return [{ date: from, hours: Math.round(hours * 100) / 100 }];
  return splitHoursOverWorkingDays(from, to, hours);
}

/** The batch a range's days share, the same no matter which request saved it. */
export function repeatBatchId(repeatId: string, from: string, to: string): string | null {
  return from === to ? null : `${repeatId}:${from}`;
}

type RepeatRule = { id: string; employeeId: string; firstFrom: Date; firstTo: Date; everyDays: number; hours: number; note: string | null; createdBy: string | null };

/** Entry rows for one time a repeat comes around, starting on `from`. */
export function occurrenceRows(repeat: RepeatRule, from: string) {
  const to = addDaysKey(from, daysBetweenKeys(utcDateKey(repeat.firstFrom), utcDateKey(repeat.firstTo)));
  const batchId = repeatBatchId(repeat.id, from, to);
  return occurrenceDays(from, to, repeat.hours).map((d) => ({
    employeeId: repeat.employeeId,
    workDate: new Date(`${d.date}T00:00:00.000Z`),
    hours: d.hours,
    note: repeat.note,
    createdBy: repeat.createdBy,
    batchId,
    repeatId: repeat.id,
  }));
}

/** Save every repeat that starts on or before `through` and isn't saved yet. */
export async function fillRepeatingManualHours(through: Date): Promise<void> {
  const throughKey = utcDateKey(through);
  const repeats = await prisma.manualHoursRepeat.findMany();
  for (const repeat of repeats) {
    const rows: ReturnType<typeof occurrenceRows> = [];
    let last = utcDateKey(repeat.filledThrough);
    for (let i = 0; i < MAX_FILL; i++) {
      const next = addDaysKey(last, repeat.everyDays);
      if (next > throughKey) break;
      rows.push(...occurrenceRows(repeat, next));
      last = next;
    }
    if (last === utcDateKey(repeat.filledThrough)) continue;
    // skipDuplicates: two requests filling at once save each day only once
    // (unique on repeatId + workDate).
    await prisma.$transaction([
      prisma.manualHoursEntry.createMany({ data: rows, skipDuplicates: true }),
      prisma.manualHoursRepeat.update({ where: { id: repeat.id }, data: { filledThrough: new Date(`${last}T00:00:00.000Z`) } }),
    ]);
  }
}
