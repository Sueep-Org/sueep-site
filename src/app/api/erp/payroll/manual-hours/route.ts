import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeePayroll } from "@/lib/erpAuth";
import { splitHoursOverWorkingDays } from "@/lib/erp/manualHours";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (s: string) => DAY.test(s) && !Number.isNaN(new Date(`${s}T00:00:00.000Z`).getTime());

/**
 * Add hours by hand for hourly work that isn't on a project (e.g. an office
 * or software intern). Paid at the person's hourly rate that day.
 * Body: { employeeId, hours, note?, date } for one day, or
 * { employeeId, hours, note?, from, to } to split a total across the
 * range's working days (Monday to Friday), saved as one entry per day.
 */
export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canSeePayroll(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { employeeId?: unknown; date?: unknown; from?: unknown; to?: unknown; hours?: unknown; note?: unknown };
  const employeeId = String(body.employeeId ?? "");
  const hours = Number(body.hours);
  const note = String(body.note ?? "").trim() || null;

  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
  if (!employee) return NextResponse.json({ error: "Pick a person" }, { status: 400 });
  if (!Number.isFinite(hours) || hours <= 0) return NextResponse.json({ error: "Enter the hours" }, { status: 400 });

  let days: { date: string; hours: number }[];
  let batchId: string | null = null;
  if (body.from !== undefined || body.to !== undefined) {
    const from = String(body.from ?? "");
    const to = String(body.to ?? "");
    if (!isDay(from) || !isDay(to) || to < from) return NextResponse.json({ error: "Pick a start and end date" }, { status: 400 });
    days = splitHoursOverWorkingDays(from, to, hours);
    if (days.length === 0) return NextResponse.json({ error: "There are no working days (Monday to Friday) in that range" }, { status: 400 });
    batchId = randomUUID();
  } else {
    const date = String(body.date ?? "");
    if (!isDay(date)) return NextResponse.json({ error: "Pick a date" }, { status: 400 });
    days = [{ date, hours: Math.round(hours * 100) / 100 }];
  }
  if (days.some((d) => d.hours > 24)) {
    return NextResponse.json({ error: "That works out to more than 24 hours on a day" }, { status: 400 });
  }

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

/** Remove one day (?id=) or every day of a date range entered together (?batchId=). */
export async function DELETE(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canSeePayroll(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params = new URL(req.url).searchParams;
  const id = params.get("id");
  const batchId = params.get("batchId");
  if (!id && !batchId) return NextResponse.json({ error: "id or batchId is required" }, { status: 400 });
  const { count } = await prisma.manualHoursEntry.deleteMany({ where: batchId ? { batchId } : { id: id! } });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, removed: count });
}
