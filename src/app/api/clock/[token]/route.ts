import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { utcDateKey } from "@/lib/erp/dates";
import { loadJanitorialShifts } from "@/lib/erp/janitorialScheduleServer";
import { easternDateKey } from "@/lib/erp/janitorialHours";
import type { JanitorialShift } from "@/lib/erp/janitorialSchedule";

/**
 * Janitor clock-in, reached from their private /clock/[token] link (no ERP
 * login; the token in Employee.clockToken is the credential). Deliberately
 * outside /api/erp so the ERP session middleware doesn't apply.
 */

type Ctx = { params: Promise<{ token: string }> };

/** An open clock-in older than this is left for an admin to fix rather than closed by the janitor. */
const MAX_OPEN_HOURS = 24;

async function employeeFor(token: string) {
  if (!token || token.length < 20) return null;
  return prisma.employee.findFirst({
    where: { clockToken: token, status: "ACTIVE" },
    select: { id: true, firstName: true },
  });
}

function utcMidnight(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

/** This janitor's shifts from yesterday (overnight shifts still running) through today. */
async function recentShifts(employeeId: string, todayKey: string): Promise<JanitorialShift[]> {
  const today = utcMidnight(todayKey);
  const yesterday = new Date(today.getTime() - 86_400_000);
  const shifts = await loadJanitorialShifts(yesterday, today);
  return shifts.filter((s) => s.employeeId === employeeId && s.status !== "CANCELLED");
}

function openEntryWhere(employeeId: string) {
  return {
    employeeId,
    clockInAt: { not: null, gte: new Date(Date.now() - MAX_OPEN_HOURS * 3_600_000) },
    clockOutAt: null,
  };
}

function parseCoord(v: unknown, limit: number): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const employee = await employeeFor(token);
  if (!employee) return NextResponse.json({ error: "This link isn't active. Ask your manager for a new one." }, { status: 404 });

  const todayKey = easternDateKey(new Date());
  const [shifts, entries, openEntry, contracts] = await Promise.all([
    recentShifts(employee.id, todayKey),
    prisma.janitorialTimeEntry.findMany({
      where: { employeeId: employee.id, date: { gte: new Date(utcMidnight(todayKey).getTime() - 86_400_000) } },
      include: { recurringContract: { select: { building: { select: { name: true } } } } },
    }),
    prisma.janitorialTimeEntry.findFirst({
      where: openEntryWhere(employee.id),
      orderBy: { clockInAt: "desc" },
      include: { recurringContract: { select: { building: { select: { name: true } } } } },
    }),
    prisma.recurringContract.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, building: { select: { name: true } } },
      orderBy: { building: { name: "asc" } },
    }),
  ]);

  const entryByKey = new Map(entries.filter((e) => e.shiftKey).map((e) => [e.shiftKey!, e]));
  const visibleShifts = shifts.filter((s) => s.date === todayKey || s.key === openEntry?.shiftKey);

  return NextResponse.json({
    firstName: employee.firstName,
    todayKey,
    shifts: visibleShifts.map((s) => {
      const entry = entryByKey.get(s.key);
      return {
        key: s.key,
        date: s.date,
        buildingName: s.buildingName,
        startTime: s.startTime,
        endTime: s.endTime,
        clockInAt: entry?.clockInAt?.toISOString() ?? null,
        clockOutAt: entry?.clockOutAt?.toISOString() ?? null,
      };
    }),
    openEntry: openEntry
      ? { id: openEntry.id, buildingName: openEntry.recurringContract.building.name, clockInAt: openEntry.clockInAt!.toISOString(), scheduled: !!openEntry.shiftKey }
      : null,
    // Unscheduled work done today, so it shows on their screen too.
    otherToday: entries
      .filter((e) => !e.shiftKey && utcDateKey(e.date) === todayKey && e.clockInAt && e.id !== openEntry?.id)
      .map((e) => ({ id: e.id, buildingName: e.recurringContract.building.name, clockInAt: e.clockInAt!.toISOString(), clockOutAt: e.clockOutAt?.toISOString() ?? null })),
    buildings: contracts.map((c) => ({ id: c.id, name: c.building.name })),
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const employee = await employeeFor(token);
  if (!employee) return NextResponse.json({ error: "This link isn't active. Ask your manager for a new one." }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const now = new Date();
  const lat = parseCoord(body.latitude, 90);
  const lng = parseCoord(body.longitude, 180);
  const accuracy = lat != null && lng != null ? parseCoord(body.accuracy, 1_000_000) : null;
  const action = String(body.action ?? "");

  if (action === "out") {
    const open = await prisma.janitorialTimeEntry.findFirst({ where: openEntryWhere(employee.id), orderBy: { clockInAt: "desc" } });
    if (!open) return NextResponse.json({ error: "You're not clocked in." }, { status: 409 });
    await prisma.janitorialTimeEntry.update({
      where: { id: open.id },
      data: {
        clockOutAt: now,
        clockOutLatitude: lat != null && lng != null ? lat : null,
        clockOutLongitude: lat != null && lng != null ? lng : null,
        clockOutAccuracy: accuracy,
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (action !== "in") return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const alreadyOpen = await prisma.janitorialTimeEntry.findFirst({
    where: openEntryWhere(employee.id),
    include: { recurringContract: { select: { building: { select: { name: true } } } } },
  });
  if (alreadyOpen) {
    return NextResponse.json({ error: `You're already clocked in at ${alreadyOpen.recurringContract.building.name}. Clock out first.` }, { status: 409 });
  }

  const gps = {
    clockInLatitude: lat != null && lng != null ? lat : null,
    clockInLongitude: lat != null && lng != null ? lng : null,
    clockInAccuracy: accuracy,
  };
  const todayKey = easternDateKey(now);

  if (body.shiftKey) {
    const shiftKey = String(body.shiftKey);
    const shift = (await recentShifts(employee.id, todayKey)).find((s) => s.key === shiftKey);
    if (!shift) return NextResponse.json({ error: "That shift isn't on your schedule today." }, { status: 404 });

    const existing = await prisma.janitorialTimeEntry.findUnique({ where: { shiftKey } });
    if (existing?.clockInAt) return NextResponse.json({ error: "You already clocked in for this shift." }, { status: 409 });
    if (existing && existing.employeeId !== employee.id) {
      return NextResponse.json({ error: "This shift is assigned to someone else." }, { status: 409 });
    }

    await prisma.janitorialTimeEntry.upsert({
      where: { shiftKey },
      create: {
        employeeId: employee.id,
        recurringContractId: shift.contractId,
        shiftKey,
        date: utcMidnight(shift.date),
        clockInAt: now,
        ...gps,
      },
      update: { clockInAt: now, ...gps },
    });
    return NextResponse.json({ ok: true });
  }

  // Unscheduled work at a building of their choosing, flagged for review.
  const contractId = String(body.contractId ?? "");
  const contract = contractId
    ? await prisma.recurringContract.findFirst({ where: { id: contractId, status: "ACTIVE" }, select: { id: true } })
    : null;
  if (!contract) return NextResponse.json({ error: "Pick the building you're working at." }, { status: 400 });

  await prisma.janitorialTimeEntry.create({
    data: {
      employeeId: employee.id,
      recurringContractId: contract.id,
      shiftKey: null,
      date: utcMidnight(todayKey),
      clockInAt: now,
      ...gps,
    },
  });
  return NextResponse.json({ ok: true });
}
