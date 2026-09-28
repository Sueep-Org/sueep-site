import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { parseDateKey, parseTime } from "@/lib/erp/janitorialSchedule";

/**
 * Creates a one-day change. For CANCELLED/CHANGED (tied to a pattern) this
 * replaces any existing change for that pattern and date, so switching a
 * shift from "covered by Ana" to "cancelled" is a single call.
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

  const kind = String(body.kind ?? "").toUpperCase();
  const date = parseDateKey(body.date);
  const notes = body.notes ? String(body.notes).trim() : null;
  if (!date) return NextResponse.json({ error: "Date is required" }, { status: 400 });

  if (kind === "EXTRA") {
    const contractId = String(body.contractId ?? "").trim();
    const employeeId = String(body.employeeId ?? "").trim();
    const startTime = parseTime(body.startTime);
    const endTime = parseTime(body.endTime);
    if (!contractId) return NextResponse.json({ error: "Pick a contract" }, { status: 400 });
    if (!employeeId) return NextResponse.json({ error: "Pick a janitor" }, { status: 400 });
    if (!startTime || !endTime || startTime === endTime) {
      return NextResponse.json({ error: "Start and end time are required" }, { status: 400 });
    }
    const contract = await prisma.recurringContract.findUnique({ where: { id: contractId }, select: { id: true } });
    if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

    const created = await prisma.janitorialShiftException.create({
      data: { recurringContractId: contractId, kind, date, employeeId, startTime, endTime, notes },
    });
    return NextResponse.json(created);
  }

  if (kind !== "CANCELLED" && kind !== "CHANGED") {
    return NextResponse.json({ error: "kind must be CANCELLED, CHANGED, or EXTRA" }, { status: 400 });
  }

  const patternId = String(body.patternId ?? "").trim();
  const pattern = patternId ? await prisma.janitorialShiftPattern.findUnique({ where: { id: patternId } }) : null;
  if (!pattern) return NextResponse.json({ error: "Shift not found" }, { status: 404 });
  if (!pattern.daysOfWeek.includes(date.getUTCDay())) {
    return NextResponse.json({ error: "That shift doesn't run on this day" }, { status: 400 });
  }

  let employeeId: string | null = null;
  let startTime: string | null = null;
  let endTime: string | null = null;
  if (kind === "CHANGED") {
    employeeId = body.employeeId ? String(body.employeeId).trim() : null;
    startTime = body.startTime ? parseTime(body.startTime) : null;
    endTime = body.endTime ? parseTime(body.endTime) : null;
    if ((body.startTime && !startTime) || (body.endTime && !endTime)) {
      return NextResponse.json({ error: "Invalid time" }, { status: 400 });
    }
    // Store only what actually differs, so a later edit to the weekly
    // pattern still flows through to anything this change didn't touch.
    if (employeeId === pattern.employeeId) employeeId = null;
    if (startTime === pattern.startTime) startTime = null;
    if (endTime === pattern.endTime) endTime = null;
    if (!employeeId && !startTime && !endTime) {
      await prisma.janitorialShiftException.deleteMany({ where: { patternId, date } });
      return NextResponse.json({ ok: true, restored: true });
    }
  }

  const data = { recurringContractId: pattern.recurringContractId, kind, employeeId, startTime, endTime, notes };
  const saved = await prisma.janitorialShiftException.upsert({
    where: { patternId_date: { patternId, date } },
    create: { patternId, date, ...data },
    update: data,
  });
  return NextResponse.json(saved);
}
