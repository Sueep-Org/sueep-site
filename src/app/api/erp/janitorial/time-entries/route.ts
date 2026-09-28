import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { parseDateKey, parseTime } from "@/lib/erp/janitorialSchedule";
import { loadJanitorialShifts } from "@/lib/erp/janitorialScheduleServer";

/**
 * Admin correction of one shift's hours. Body:
 *   { shiftKey, date }      - a scheduled shift (creates its entry if it has none), or
 *   { entryId }             - an existing entry (e.g. unscheduled work)
 * plus either { noShow: true } or { startTime, endTime }, and optional notes.
 * Clock times the janitor recorded are kept; the correction overrides them.
 */
export async function PUT(req: Request) {
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

  const noShow = body.noShow === true;
  const startTime = noShow ? null : parseTime(body.startTime);
  const endTime = noShow ? null : parseTime(body.endTime);
  if (!noShow && (!startTime || !endTime || startTime === endTime)) {
    return NextResponse.json({ error: "Enter a start and end time" }, { status: 400 });
  }
  const correction = {
    manualNoShow: noShow,
    manualStartTime: startTime,
    manualEndTime: endTime,
    manualBy: auth.email,
    manualAt: new Date(),
    notes: body.notes ? String(body.notes).trim() : null,
  };

  if (body.entryId) {
    try {
      const entry = await prisma.janitorialTimeEntry.update({ where: { id: String(body.entryId) }, data: correction });
      return NextResponse.json(entry);
    } catch {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }
  }

  const shiftKey = String(body.shiftKey ?? "");
  const date = parseDateKey(body.date);
  if (!shiftKey || !date) return NextResponse.json({ error: "shiftKey and date are required" }, { status: 400 });

  const shift = (await loadJanitorialShifts(date, date)).find((s) => s.key === shiftKey);
  if (!shift) return NextResponse.json({ error: "Shift not found on the schedule" }, { status: 404 });

  const entry = await prisma.janitorialTimeEntry.upsert({
    where: { shiftKey },
    create: { shiftKey, employeeId: shift.employeeId, recurringContractId: shift.contractId, date, ...correction },
    update: correction,
  });
  return NextResponse.json(entry);
}
