import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { parseDateKey } from "@/lib/erp/janitorialSchedule";
import { loadJanitorialShifts } from "@/lib/erp/janitorialScheduleServer";

function shortDay(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Drag and drop on the janitorial calendar: moves one day's shift to another
 * day without touching the weekly schedule. Body { shiftKey, toDate }.
 *   - A weekly shift's day is skipped and a one-time shift is created on
 *     toDate with the same janitor, times, and building (including any
 *     one-day cover or hour change already on it).
 *   - A one-time shift just changes its date.
 * Refused once someone has clocked in or hours were corrected for it.
 */
export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const shiftKey = String(body.shiftKey ?? "");
  const toDate = parseDateKey(body.toDate);
  if (!shiftKey || !toDate) return NextResponse.json({ error: "shiftKey and toDate are required" }, { status: 400 });

  if (await prisma.janitorialTimeEntry.findUnique({ where: { shiftKey }, select: { id: true } })) {
    return NextResponse.json({ error: "Hours are already recorded for this shift, so it can't be moved" }, { status: 409 });
  }

  // One-time shift: just change its date.
  if (shiftKey.startsWith("extra:")) {
    const id = shiftKey.slice("extra:".length);
    const extra = await prisma.janitorialShiftException.findUnique({ where: { id } });
    if (!extra || extra.kind !== "EXTRA") return NextResponse.json({ error: "Shift not found" }, { status: 404 });
    await prisma.janitorialShiftException.update({ where: { id }, data: { date: toDate } });
    return NextResponse.json({ ok: true });
  }

  // Weekly shift: key is `${patternId}:${YYYY-MM-DD}`.
  const [patternId, dateKey] = shiftKey.split(":");
  const fromDate = parseDateKey(dateKey);
  if (!patternId || !fromDate) return NextResponse.json({ error: "Invalid shift" }, { status: 400 });
  if (fromDate.getTime() === toDate.getTime()) return NextResponse.json({ ok: true });

  const shift = (await loadJanitorialShifts(fromDate, fromDate)).find((s) => s.key === shiftKey);
  if (!shift) return NextResponse.json({ error: "Shift not found on the schedule" }, { status: 404 });
  if (shift.status === "CANCELLED") return NextResponse.json({ error: "A skipped shift can't be moved" }, { status: 400 });

  const note = `Moved from ${shortDay(fromDate)}`;
  await prisma.$transaction([
    prisma.janitorialShiftException.upsert({
      where: { patternId_date: { patternId, date: fromDate } },
      create: { patternId, date: fromDate, recurringContractId: shift.contractId, kind: "CANCELLED", notes: `Moved to ${shortDay(toDate)}` },
      update: { kind: "CANCELLED", employeeId: null, startTime: null, endTime: null, notes: `Moved to ${shortDay(toDate)}` },
    }),
    prisma.janitorialShiftException.create({
      data: {
        recurringContractId: shift.contractId,
        kind: "EXTRA",
        date: toDate,
        employeeId: shift.employeeId,
        startTime: shift.startTime,
        endTime: shift.endTime,
        notes: shift.notes && shift.status !== "REGULAR" ? `${note}. ${shift.notes}` : note,
      },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
