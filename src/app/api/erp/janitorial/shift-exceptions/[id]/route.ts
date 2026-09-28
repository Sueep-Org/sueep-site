import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { parseDateKey, parseTime } from "@/lib/erp/janitorialSchedule";

type Ctx = { params: Promise<{ id: string }> };

/** Edits an extra visit (the only kind edited in place; pattern-based
 * changes are re-posted to the collection route instead). */
export async function PATCH(req: Request, ctx: Ctx) {
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

  const existing = await prisma.janitorialShiftException.findUnique({ where: { id } });
  if (!existing || existing.kind !== "EXTRA") return NextResponse.json({ error: "Extra visit not found" }, { status: 404 });

  const data: { recurringContractId?: string; date?: Date; employeeId?: string; startTime?: string; endTime?: string; notes?: string | null } = {};
  if (body.contractId !== undefined) {
    const contract = await prisma.recurringContract.findUnique({ where: { id: String(body.contractId) }, select: { id: true } });
    if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    data.recurringContractId = contract.id;
  }
  if (body.date !== undefined) {
    const d = parseDateKey(body.date);
    if (!d) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    data.date = d;
  }
  if (body.employeeId !== undefined) {
    const e = String(body.employeeId ?? "").trim();
    if (!e) return NextResponse.json({ error: "Pick a janitor" }, { status: 400 });
    data.employeeId = e;
  }
  for (const field of ["startTime", "endTime"] as const) {
    if (body[field] !== undefined) {
      const t = parseTime(body[field]);
      if (!t) return NextResponse.json({ error: "Invalid time" }, { status: 400 });
      data[field] = t;
    }
  }
  if ((data.startTime ?? existing.startTime) === (data.endTime ?? existing.endTime)) {
    return NextResponse.json({ error: "Start and end time can't be the same" }, { status: 400 });
  }
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim() : null;

  const updated = await prisma.janitorialShiftException.update({ where: { id }, data });
  return NextResponse.json(updated);
}

/** Removes a one-day change: restores a cancelled/changed shift to its
 * weekly pattern, or deletes an extra visit. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  try {
    await prisma.janitorialShiftException.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
