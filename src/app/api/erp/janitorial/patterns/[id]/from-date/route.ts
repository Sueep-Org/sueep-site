import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { parseDateKey } from "@/lib/erp/janitorialSchedule";
import { parsePatternInput } from "@/lib/erp/janitorialPatternInput";

type Ctx = { params: Promise<{ id: string }> };

/**
 * "This and following weeks" edits from the calendar, like a recurring event
 * in Google Calendar. Body: { date, action: "end" } stops the weekly shift
 * from `date` on; { date, action: "update", ...fields } changes it from
 * `date` on. Weeks before `date` keep the old shift, so past schedules stay
 * accurate: the old pattern is ended the day before and a new one starts on
 * `date` (or, when `date` is on/before the pattern's start, it's edited in
 * place). One-day changes on/after `date` are dropped, same as Google
 * Calendar resetting exceptions on a "following" edit.
 */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const date = parseDateKey(body.date);
  if (!date) return NextResponse.json({ error: "Date is required" }, { status: 400 });
  const action = String(body.action ?? "");
  if (action !== "end" && action !== "update") {
    return NextResponse.json({ error: "action must be end or update" }, { status: 400 });
  }

  const pattern = await prisma.janitorialShiftPattern.findUnique({ where: { id } });
  if (!pattern) return NextResponse.json({ error: "Shift not found" }, { status: 404 });

  const dayBefore = new Date(date.getTime() - 86_400_000);
  const startsOnOrAfterDate = pattern.effectiveFrom >= date;

  if (action === "end") {
    await prisma.$transaction(async (tx) => {
      await tx.janitorialShiftException.deleteMany({ where: { patternId: id, date: { gte: date } } });
      if (startsOnOrAfterDate) await tx.janitorialShiftPattern.delete({ where: { id } });
      else await tx.janitorialShiftPattern.update({ where: { id }, data: { effectiveUntil: dayBefore } });
    });
    return NextResponse.json({ ok: true });
  }

  const parsed = parsePatternInput(
    {
      employeeId: body.employeeId,
      daysOfWeek: body.daysOfWeek,
      startTime: body.startTime,
      endTime: body.endTime,
      notes: body.notes,
    },
    true
  );
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  let recurringContractId = pattern.recurringContractId;
  if (body.contractId !== undefined) {
    const contract = await prisma.recurringContract.findUnique({ where: { id: String(body.contractId) }, select: { id: true } });
    if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    recurringContractId = contract.id;
  }

  const saved = await prisma.$transaction(async (tx) => {
    await tx.janitorialShiftException.deleteMany({ where: { patternId: id, date: { gte: date } } });
    if (startsOnOrAfterDate) {
      return tx.janitorialShiftPattern.update({ where: { id }, data: { ...parsed.data, recurringContractId } });
    }
    await tx.janitorialShiftPattern.update({ where: { id }, data: { effectiveUntil: dayBefore } });
    return tx.janitorialShiftPattern.create({
      data: {
        recurringContractId,
        employeeId: parsed.data.employeeId ?? pattern.employeeId,
        daysOfWeek: parsed.data.daysOfWeek ?? pattern.daysOfWeek,
        startTime: parsed.data.startTime ?? pattern.startTime,
        endTime: parsed.data.endTime ?? pattern.endTime,
        notes: parsed.data.notes !== undefined ? parsed.data.notes : pattern.notes,
        effectiveFrom: date,
        effectiveUntil: pattern.effectiveUntil,
      },
    });
  });
  return NextResponse.json(saved);
}
