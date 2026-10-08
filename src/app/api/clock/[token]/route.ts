import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { utcDateKey } from "@/lib/erp/dates";
import { loadJanitorialShifts, mainBuildingByEmployee } from "@/lib/erp/janitorialScheduleServer";
import { easternDateKey } from "@/lib/erp/janitorialHours";
import { loadJanitorialHours } from "@/lib/erp/janitorialHoursServer";
import { ensureBuildingCoordinates } from "@/lib/erp/geocode";
import type { JanitorialShift } from "@/lib/erp/janitorialSchedule";
import { noticesForJanitor } from "@/lib/erp/janitorialQualityChecks";

/**
 * Janitor clock-in, reached from their private /clock/[token] link (no ERP
 * login; the token in Employee.clockToken is the credential). Deliberately
 * outside /api/erp so the ERP session middleware doesn't apply.
 */

type Ctx = { params: Promise<{ token: string }> };

/** An open clock-in older than this is left for an admin to fix rather than closed by the janitor. */
const MAX_OPEN_HOURS = 24;
const UPCOMING_DAYS = 7;
const PAYROLL_ANCHOR_KEY = "payrollAnchor";
const DEFAULT_PAYROLL_ANCHOR = "2024-01-01";

/** Errors carry a code so the clock page can show them in the janitor's
 * language; `error` stays as an English fallback. */
type ClockErrorCode =
  | "LINK_INACTIVE"
  | "NOT_CLOCKED_IN"
  | "ALREADY_CLOCKED_IN"
  | "SHIFT_NOT_TODAY"
  | "SHIFT_ALREADY_CLOCKED"
  | "SHIFT_OTHER_PERSON"
  | "PICK_BUILDING"
  | "INVALID";

const ENGLISH: Record<ClockErrorCode, string> = {
  LINK_INACTIVE: "This link isn't active. Ask your manager for a new one.",
  NOT_CLOCKED_IN: "You're not clocked in.",
  ALREADY_CLOCKED_IN: "You're already clocked in. Clock out first.",
  SHIFT_NOT_TODAY: "That shift isn't on your schedule today.",
  SHIFT_ALREADY_CLOCKED: "You already clocked in for this shift.",
  SHIFT_OTHER_PERSON: "This shift is assigned to someone else.",
  PICK_BUILDING: "Pick the building you're working at.",
  INVALID: "Invalid request.",
};

function clockError(code: ClockErrorCode, status: number, extra: Record<string, string> = {}) {
  return NextResponse.json({ error: ENGLISH[code], code, ...extra }, { status });
}

/** Current payroll period, same biweekly anchor the Payroll page uses. */
async function currentPayPeriod(todayKey: string): Promise<{ start: Date; end: Date }> {
  const setting = await prisma.appSetting.findUnique({ where: { key: PAYROLL_ANCHOR_KEY } });
  const anchor = utcMidnight(setting?.value ?? DEFAULT_PAYROLL_ANCHOR);
  const twoWeeks = 14 * 86_400_000;
  const index = Math.floor((utcMidnight(todayKey).getTime() - anchor.getTime()) / twoWeeks);
  const start = new Date(anchor.getTime() + index * twoWeeks);
  return { start, end: new Date(start.getTime() + twoWeeks - 86_400_000) };
}

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

/** Looks the building's location up after the response is sent, so the
 * location check has something to compare against without making the
 * janitor wait on the geocoder. No-op once the building has coordinates. */
function lookUpBuildingLocationLater(contractId: string) {
  after(async () => {
    const contract = await prisma.recurringContract.findUnique({ where: { id: contractId }, select: { buildingId: true } });
    if (contract) await ensureBuildingCoordinates(contract.buildingId);
  });
}

function parseCoord(v: unknown, limit: number): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const employee = await employeeFor(token);
  if (!employee) return clockError("LINK_INACTIVE", 404);

  const todayKey = easternDateKey(new Date());
  const today = utcMidnight(todayKey);
  const payPeriod = await currentPayPeriod(todayKey);
  const [shifts, entries, openEntry, contracts, upcoming, periodHours, notices] = await Promise.all([
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
    loadJanitorialShifts(today, new Date(today.getTime() + (UPCOMING_DAYS - 1) * 86_400_000)),
    loadJanitorialHours(payPeriod.start, today),
    noticesForJanitor(employee.id, todayKey),
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
    // Notes from recent site visits at their buildings, until they tap "seen".
    notices,
    defaultBuildingId: (await mainBuildingByEmployee([employee.id])).get(employee.id) ?? null,
    upcoming: upcoming
      .filter((s) => s.employeeId === employee.id)
      .map((s) => ({
        key: s.key,
        date: s.date,
        buildingName: s.buildingName,
        startTime: s.startTime,
        endTime: s.endTime,
        skipped: s.status === "CANCELLED",
        timeOff: !!s.timeOffType,
      })),
    payPeriod: {
      start: utcDateKeyOf(payPeriod.start),
      end: utcDateKeyOf(payPeriod.end),
      days: periodHours
        .filter((r) => r.employeeId === employee.id && r.source !== "UPCOMING" && r.source !== "SKIPPED")
        .map((r) => ({ key: r.key, date: r.date, buildingName: r.buildingName, hours: r.hours, source: r.source, breakDeducted: r.breakDeducted })),
    },
  });
}

function utcDateKeyOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const employee = await employeeFor(token);
  if (!employee) return clockError("LINK_INACTIVE", 404);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return clockError("INVALID", 400);
  }

  const now = new Date();
  const lat = parseCoord(body.latitude, 90);
  const lng = parseCoord(body.longitude, 180);
  const accuracy = lat != null && lng != null ? parseCoord(body.accuracy, 1_000_000) : null;
  const action = String(body.action ?? "");

  if (action === "seen") {
    const notice = (await noticesForJanitor(employee.id, easternDateKey(now))).find((n) => n.id === String(body.checkId ?? ""));
    if (notice) {
      await prisma.janitorialQualityNoticeSeen.upsert({
        where: { qualityCheckId_employeeId: { qualityCheckId: notice.id, employeeId: employee.id } },
        create: { qualityCheckId: notice.id, employeeId: employee.id },
        update: {},
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "out") {
    const open = await prisma.janitorialTimeEntry.findFirst({ where: openEntryWhere(employee.id), orderBy: { clockInAt: "desc" } });
    if (!open) return clockError("NOT_CLOCKED_IN", 409);
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

  if (action !== "in") return clockError("INVALID", 400);

  const alreadyOpen = await prisma.janitorialTimeEntry.findFirst({
    where: openEntryWhere(employee.id),
    include: { recurringContract: { select: { building: { select: { name: true } } } } },
  });
  if (alreadyOpen) return clockError("ALREADY_CLOCKED_IN", 409, { buildingName: alreadyOpen.recurringContract.building.name });

  const gps = {
    clockInLatitude: lat != null && lng != null ? lat : null,
    clockInLongitude: lat != null && lng != null ? lng : null,
    clockInAccuracy: accuracy,
  };
  const todayKey = easternDateKey(now);

  if (body.shiftKey) {
    const shiftKey = String(body.shiftKey);
    const shift = (await recentShifts(employee.id, todayKey)).find((s) => s.key === shiftKey);
    if (!shift) return clockError("SHIFT_NOT_TODAY", 404);

    const existing = await prisma.janitorialTimeEntry.findUnique({ where: { shiftKey } });
    if (existing?.clockInAt) return clockError("SHIFT_ALREADY_CLOCKED", 409);
    if (existing && existing.employeeId !== employee.id) return clockError("SHIFT_OTHER_PERSON", 409);

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
    if (gps.clockInLatitude != null) lookUpBuildingLocationLater(shift.contractId);
    return NextResponse.json({ ok: true });
  }

  // Unscheduled work at a building of their choosing, flagged for review.
  const contractId = String(body.contractId ?? "");
  const contract = contractId
    ? await prisma.recurringContract.findFirst({ where: { id: contractId, status: "ACTIVE" }, select: { id: true } })
    : null;
  if (!contract) return clockError("PICK_BUILDING", 400);

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
  if (gps.clockInLatitude != null) lookUpBuildingLocationLater(contract.id);
  return NextResponse.json({ ok: true });
}
