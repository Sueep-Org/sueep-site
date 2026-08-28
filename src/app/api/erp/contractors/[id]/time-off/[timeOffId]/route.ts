import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TIME_OFF_TYPES, parseTimeOffDate, findOverlappingContractorTimeOff, overlapErrorMessage } from "@/lib/erp/timeOff";

type Ctx = { params: Promise<{ id: string; timeOffId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id, timeOffId } = await ctx.params;
  const existing = await prisma.contractorTimeOff.findFirst({ where: { id: timeOffId, contractorId: id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const startDate = body.startDate !== undefined ? parseTimeOffDate(body.startDate) : existing.startDate;
  const endDate = body.endDate !== undefined ? parseTimeOffDate(body.endDate) : existing.endDate;
  if (!startDate) return NextResponse.json({ error: "startDate is required" }, { status: 400 });
  if (!endDate) return NextResponse.json({ error: "endDate is required" }, { status: 400 });
  if (endDate.getTime() < startDate.getTime()) {
    return NextResponse.json({ error: "endDate must be on or after startDate" }, { status: 400 });
  }

  let type = existing.type;
  if (body.type !== undefined) {
    const typeRaw = String(body.type || "VACATION").toUpperCase();
    type = TIME_OFF_TYPES.includes(typeRaw as (typeof TIME_OFF_TYPES)[number]) ? typeRaw : "VACATION";
  }

  try {
    const overlap = await findOverlappingContractorTimeOff(id, startDate, endDate, timeOffId);
    if (overlap) {
      return NextResponse.json({ error: overlapErrorMessage(overlap) }, { status: 409 });
    }

    const row = await prisma.contractorTimeOff.update({
      where: { id: timeOffId },
      data: {
        startDate,
        endDate,
        type,
        notes: body.notes !== undefined ? (body.notes ? String(body.notes).trim() : null) : existing.notes,
      },
    });
    return NextResponse.json(row);
  } catch (e) {
    console.error("PATCH /api/erp/contractors/[id]/time-off/[timeOffId]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, timeOffId } = await ctx.params;
  try {
    const deleted = await prisma.contractorTimeOff.deleteMany({ where: { id: timeOffId, contractorId: id } });
    if (deleted.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
