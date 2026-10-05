import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeePayroll } from "@/lib/erpAuth";
import { splitHoursOverWorkingDays } from "@/lib/erp/manualHours";
import { daysBetweenKeys, occurrenceDays, occurrenceRows } from "@/lib/erp/manualHoursRepeat";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (s: string) => DAY.test(s) && !Number.isNaN(new Date(`${s}T00:00:00.000Z`).getTime());
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Add hours by hand for hourly work that isn't on a project (e.g. an office
 * or software intern). Paid at the person's hourly rate that day.
 * Body: { employeeId, hours, note?, date } for one day, or
 * { employeeId, hours, note?, from, to } to split a total across the
 * range's working days (Monday to Friday), saved as one entry per day.
 * repeatEvery: 7 or 14 repeats it that often from then on (see
 * lib/erp/manualHoursRepeat.ts).
 */
export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canSeePayroll(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { employeeId?: unknown; date?: unknown; from?: unknown; to?: unknown; hours?: unknown; note?: unknown; repeatEvery?: unknown };
  const employeeId = String(body.employeeId ?? "");
  const hours = Number(body.hours);
  const note = String(body.note ?? "").trim() || null;
  const repeatEvery = Number(body.repeatEvery ?? 0);

  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
  if (!employee) return NextResponse.json({ error: "Pick a person" }, { status: 400 });
  if (!Number.isFinite(hours) || hours <= 0) return NextResponse.json({ error: "Enter the hours" }, { status: 400 });
  if (![0, 7, 14].includes(repeatEvery)) return NextResponse.json({ error: "Repeat every week or every 2 weeks" }, { status: 400 });

  let from: string;
  let to: string;
  if (body.from !== undefined || body.to !== undefined) {
    from = String(body.from ?? "");
    to = String(body.to ?? "");
    if (!isDay(from) || !isDay(to) || to < from) return NextResponse.json({ error: "Pick a start and end date" }, { status: 400 });
    if (splitHoursOverWorkingDays(from, to, hours).length === 0) {
      return NextResponse.json({ error: "There are no working days (Monday to Friday) in that range" }, { status: 400 });
    }
  } else {
    from = to = String(body.date ?? "");
    if (!isDay(from)) return NextResponse.json({ error: "Pick a date" }, { status: 400 });
  }
  const days = occurrenceDays(from, to, hours);
  if (days.some((d) => d.hours > 24)) {
    return NextResponse.json({ error: "That works out to more than 24 hours on a day" }, { status: 400 });
  }
  if (repeatEvery && daysBetweenKeys(from, to) + 1 > repeatEvery) {
    return NextResponse.json({ error: `A range that repeats every ${repeatEvery === 7 ? "week" : "2 weeks"} can be at most ${repeatEvery} days long` }, { status: 400 });
  }

  if (repeatEvery) {
    await prisma.$transaction(async (tx) => {
      const repeat = await tx.manualHoursRepeat.create({
        data: {
          employeeId, everyDays: repeatEvery, hours, note, createdBy: auth.email ?? null,
          firstFrom: new Date(`${from}T00:00:00.000Z`), firstTo: new Date(`${to}T00:00:00.000Z`), filledThrough: new Date(`${from}T00:00:00.000Z`),
        },
      });
      await tx.manualHoursEntry.createMany({ data: occurrenceRows(repeat, from) });
    });
    return NextResponse.json({ ok: true, days: days.length });
  }

  const batchId = from === to ? null : randomUUID();
  await prisma.manualHoursEntry.createMany({
    data: days.map((d) => ({
      employeeId,
      workDate: new Date(`${d.date}T00:00:00.000Z`),
      hours: d.hours,
      note,
      createdBy: auth.email ?? null,
      batchId,
    })),
  });
  return NextResponse.json({ ok: true, days: days.length });
}

/** The entries of one day (id) or one date range entered together (batchId). */
async function loadGroup(id: string | null, batchId: string | null) {
  if (!id && !batchId) return [];
  return prisma.manualHoursEntry.findMany({ where: batchId ? { batchId } : { id: id! }, orderBy: { workDate: "asc" } });
}

/** Spread a new total over the same days a group already covers. */
function resplit(group: { id: string; workDate: Date }[], hours: number): { id: string; hours: number }[] {
  if (group.length === 1) return [{ id: group[0].id, hours: Math.round(hours * 100) / 100 }];
  const split = new Map(splitHoursOverWorkingDays(dayKey(group[0].workDate), dayKey(group[group.length - 1].workDate), hours).map((d) => [d.date, d.hours]));
  // Days that aren't Monday to Friday can't be in a range, but stay safe.
  return group.map((e) => ({ id: e.id, hours: split.get(dayKey(e.workDate)) ?? 0 }));
}

/**
 * Edit one day (id) or one date range (batchId): new hours (a range's total
 * is split again over its days), note, and for a single day its date.
 * later: true also changes every later repeat of the same repeating entry,
 * and the repeats still to come.
 */
export async function PATCH(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canSeePayroll(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { id?: unknown; batchId?: unknown; hours?: unknown; note?: unknown; date?: unknown; later?: unknown };
  const group = await loadGroup(body.id ? String(body.id) : null, body.batchId ? String(body.batchId) : null);
  if (group.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const hours = Number(body.hours);
  const note = String(body.note ?? "").trim() || null;
  if (!Number.isFinite(hours) || hours <= 0) return NextResponse.json({ error: "Enter the hours" }, { status: 400 });

  const date = body.date !== undefined && group.length === 1 ? String(body.date) : null;
  if (date !== null && !isDay(date)) return NextResponse.json({ error: "Pick a date" }, { status: 400 });

  const updates = resplit(group, hours);
  if (updates.some((u) => u.hours > 24)) return NextResponse.json({ error: "That works out to more than 24 hours on a day" }, { status: 400 });

  const repeatId = group[0].repeatId;
  const later = body.later === true && !!repeatId;

  try {
    await prisma.$transaction(async (tx) => {
      for (const u of updates) {
        await tx.manualHoursEntry.update({
          where: { id: u.id },
          data: { hours: u.hours, note, ...(date ? { workDate: new Date(`${date}T00:00:00.000Z`) } : {}) },
        });
      }
      if (!later) return;
      // Repeats still to come use the new hours and note too.
      await tx.manualHoursRepeat.update({ where: { id: repeatId! }, data: { hours, note } });
      const laterEntries = await tx.manualHoursEntry.findMany({
        where: { repeatId, workDate: { gt: group[group.length - 1].workDate } },
        orderBy: { workDate: "asc" },
      });
      const laterGroups = new Map<string, typeof laterEntries>();
      for (const e of laterEntries) {
        const key = e.batchId ?? e.id;
        laterGroups.set(key, [...(laterGroups.get(key) ?? []), e]);
      }
      for (const g of laterGroups.values()) {
        for (const u of resplit(g, hours)) await tx.manualHoursEntry.update({ where: { id: u.id }, data: { hours: u.hours, note } });
      }
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "This repeat already has hours on that day" }, { status: 400 });
    }
    throw err;
  }
  return NextResponse.json({ ok: true });
}

/**
 * Remove one day (?id=) or every day of a date range entered together
 * (?batchId=). &later=1 on a repeating entry also removes every later
 * repeat and stops it repeating (earlier ones stay).
 */
export async function DELETE(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canSeePayroll(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params = new URL(req.url).searchParams;
  const id = params.get("id");
  const batchId = params.get("batchId");
  if (!id && !batchId) return NextResponse.json({ error: "id or batchId is required" }, { status: 400 });
  const group = await loadGroup(id, batchId);
  if (group.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const repeatId = group[0].repeatId;
  if (params.get("later") === "1" && repeatId) {
    const [{ count }] = await prisma.$transaction([
      prisma.manualHoursEntry.deleteMany({ where: { repeatId, workDate: { gte: group[0].workDate } } }),
      prisma.manualHoursRepeat.delete({ where: { id: repeatId } }),
    ]);
    return NextResponse.json({ ok: true, removed: count });
  }

  const { count } = await prisma.manualHoursEntry.deleteMany({ where: { id: { in: group.map((e) => e.id) } } });
  return NextResponse.json({ ok: true, removed: count });
}
