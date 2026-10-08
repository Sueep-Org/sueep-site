import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { parseDateKey } from "@/lib/erp/janitorialSchedule";
import { QUALITY_CHECKER_ROLES, notifyQualityCheckAssigned, notifyTeamAfterCheck } from "@/lib/erp/janitorialQualityChecks";
import { parseAreaResults } from "@/lib/erp/janitorialQualityShared";
import type { Prisma } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

/** Move, reassign, save the visit form, or mark a quality check done / not done. */
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

  const current = await prisma.janitorialQualityCheck.findUnique({ where: { id }, select: { assignedUserId: true, scheduledDate: true, areaResults: true, status: true } });
  if (!current) return NextResponse.json({ error: "Quality check not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.date !== undefined) {
    const d = parseDateKey(body.date);
    if (!d) return NextResponse.json({ error: "Pick a date" }, { status: 400 });
    data.scheduledDate = d;
    // A new date gets its own overdue email if it's missed too.
    if (d.getTime() !== current.scheduledDate.getTime()) data.overdueEmailSentAt = null;
  }
  if (body.assignedUserId !== undefined) {
    const userId = String(body.assignedUserId ?? "").trim();
    const user = userId ? await prisma.erpUser.findUnique({ where: { id: userId }, select: { role: true } }) : null;
    if (!user || !QUALITY_CHECKER_ROLES.includes(user.role)) {
      return NextResponse.json({ error: "Quality checks are done by an Admin or Project Manager" }, { status: 400 });
    }
    data.assignedUserId = userId;
  }
  if (body.notes !== undefined) {
    data.notes = body.notes ? String(body.notes).trim() || null : null;
  }
  // The visit form
  const text = (v: unknown, max = 5000) => (v ? String(v).trim().slice(0, max) || null : null);
  if (body.areaResults !== undefined) {
    data.areaResults = parseAreaResults(body.areaResults) as unknown as Prisma.InputJsonValue;
  }
  if (body.propertyManagerName !== undefined) data.propertyManagerName = text(body.propertyManagerName, 200);
  if (body.propertyManagerNotes !== undefined) data.propertyManagerNotes = text(body.propertyManagerNotes);
  if (body.teamUpdates !== undefined) data.teamUpdates = text(body.teamUpdates);

  if (body.done !== undefined) {
    const done = body.done === true;
    if (done) {
      const results = parseAreaResults(body.areaResults !== undefined ? body.areaResults : current.areaResults);
      if (!results.length) return NextResponse.json({ error: "Add at least one area before finishing" }, { status: 400 });
      const unrated = results.filter((r) => !r.rating);
      if (unrated.length) {
        return NextResponse.json({ error: `Mark Good or Needs attention for: ${unrated.map((r) => r.area).join(", ")}` }, { status: 400 });
      }
    }
    // Saving changes to a finished check keeps who finished it and when.
    if (!(done && current.status === "DONE")) {
      data.status = done ? "DONE" : "SCHEDULED";
      data.completedAt = done ? new Date() : null;
      data.completedBy = done ? auth.email : null;
    }
  }

  const check = await prisma.janitorialQualityCheck.update({ where: { id }, data });
  if (data.assignedUserId && data.assignedUserId !== current.assignedUserId) {
    await notifyQualityCheckAssigned(id, auth.email);
  }
  if (data.status === "DONE" && current.status !== "DONE") {
    await notifyTeamAfterCheck(id).catch((e) => console.error("notifyTeamAfterCheck failed", e));
  }
  return NextResponse.json(check);
}

/** Cancels a check (removes it). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const deleted = await prisma.janitorialQualityCheck.deleteMany({ where: { id } });
  if (!deleted.count) return NextResponse.json({ error: "Quality check not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
