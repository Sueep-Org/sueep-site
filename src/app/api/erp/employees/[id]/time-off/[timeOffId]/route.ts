import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  TIME_OFF_TYPES,
  parseTimeOffDate,
  findOverlappingTimeOff,
  overlapErrorMessage,
  checkPaidTimeOffLimit,
  parseLimitOverride,
} from "@/lib/erp/timeOff";
import { getErpAuth } from "@/lib/erpAuth";

type Ctx = { params: Promise<{ id: string; timeOffId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id, timeOffId } = await ctx.params;
  const auth = await getErpAuth();
  const existing = await prisma.employeeTimeOff.findFirst({ where: { id: timeOffId, employeeId: id } });
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

  // Changing the dates or type sends it back for approval and re-checks the
  // yearly limit, so an edit can't sneak past either. A notes-only edit keeps
  // its status.
  const datesChanged =
    startDate.getTime() !== existing.startDate.getTime() ||
    endDate.getTime() !== existing.endDate.getTime() ||
    type !== existing.type;
  let limitFields = { limitOverride: existing.limitOverride, unpaidDays: existing.unpaidDays };
  if (datesChanged || body.limitOverride !== undefined) {
    const override = body.limitOverride !== undefined ? parseLimitOverride(body.limitOverride) : parseLimitOverride(existing.limitOverride);
    const limit = await checkPaidTimeOffLimit({ employeeId: id, startDate, endDate, type, override, role: auth?.role, excludeId: timeOffId });
    if (!limit.ok) return NextResponse.json(limit.body, { status: limit.status });
    limitFields = { limitOverride: limit.limitOverride, unpaidDays: limit.unpaidDays };
  }
  const backToPending =
    datesChanged || limitFields.limitOverride !== existing.limitOverride || limitFields.unpaidDays !== existing.unpaidDays;

  try {
    const overlap = await findOverlappingTimeOff(id, startDate, endDate, timeOffId);
    if (overlap) {
      return NextResponse.json({ error: overlapErrorMessage(overlap) }, { status: 409 });
    }

    const row = await prisma.employeeTimeOff.update({
      where: { id: timeOffId },
      data: {
        startDate,
        endDate,
        type,
        notes: body.notes !== undefined ? (body.notes ? String(body.notes).trim() : null) : existing.notes,
        ...limitFields,
        ...(backToPending
          ? { status: "PENDING", requestedBy: auth?.email ?? existing.requestedBy, reviewedBy: null, reviewedAt: null, reviewNote: null }
          : {}),
      },
    });
    return NextResponse.json(row);
  } catch (e) {
    console.error("PATCH /api/erp/employees/[id]/time-off/[timeOffId]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, timeOffId } = await ctx.params;
  try {
    const deleted = await prisma.employeeTimeOff.deleteMany({ where: { id: timeOffId, employeeId: id } });
    if (deleted.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
