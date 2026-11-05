import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dayKey } from "@/lib/erp/schedule";
import { isScheduleRemovalReason } from "@/lib/erp/scheduleRemovals";
import { loadAppLists } from "@/lib/erp/appListsServer";
import { getErpAuth } from "@/lib/erpAuth";

// Takes a change order off one calendar day with a reason, the CO version of
// the project day-assignment DELETE. A planned day's own row is removed
// first by the client (co-day-assignments DELETE, which also cancels
// invites). Here: if the day is the CO's start or end date, that date is
// cleared (start also clears requestedDate, which the calendar falls back
// to), then any reason except MISTAKE leaves a grayed-out ScheduleDayRemoval.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { changeOrderId?: unknown; dateKey?: unknown; reason?: unknown; note?: unknown; coveredBy?: unknown }
    | null;
  const changeOrderId = typeof body?.changeOrderId === "string" ? body.changeOrderId : "";
  const k = typeof body?.dateKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.dateKey) ? body.dateKey : "";
  if (!changeOrderId || !k || !isScheduleRemovalReason(body?.reason, (await loadAppLists()).removalReasons)) {
    return NextResponse.json({ error: "changeOrderId, dateKey and reason are required" }, { status: 400 });
  }
  const reason = body.reason;
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;
  const coveredBy = typeof body?.coveredBy === "string" && body.coveredBy.trim() ? body.coveredBy.trim().slice(0, 200) : null;

  const co = await prisma.projectChangeOrder.findUnique({
    where: { id: changeOrderId },
    select: { id: true, projectId: true, startDate: true, requestedDate: true, endDate: true },
  });
  if (!co) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const startK = (co.startDate ?? co.requestedDate) ? dayKey((co.startDate ?? co.requestedDate)!) : null;
  const endK = co.endDate ? dayKey(co.endDate) : null;
  const data: { startDate?: null; requestedDate?: null; endDate?: null; completedAt?: null } = {};
  if (startK === k) {
    data.startDate = null;
    data.requestedDate = null;
  }
  // endDate and completedAt are kept in step (see the CO PATCH route).
  if (endK === k) {
    data.endDate = null;
    data.completedAt = null;
  }
  if (Object.keys(data).length > 0) {
    await prisma.projectChangeOrder.update({ where: { id: co.id }, data });
  }

  let removal: { id: string; note: string | null; coveredBy: string | null; removedByName: string | null } | null = null;
  if (reason !== "MISTAKE") {
    const auth = await getErpAuth();
    let removedByName: string | null = null;
    if (auth?.email) {
      const emp = await prisma.employee.findFirst({
        where: { email: { equals: auth.email, mode: "insensitive" } },
        select: { firstName: true, lastName: true },
      });
      removedByName = (emp ? `${emp.firstName} ${emp.lastName}`.trim() : "") || auth.email.split("@")[0]!;
    }
    removal = await prisma.scheduleDayRemoval.create({
      data: {
        projectId: co.projectId,
        changeOrderId: co.id,
        date: new Date(`${k}T00:00:00.000Z`),
        reason,
        note,
        coveredBy,
        removedByName,
      },
      select: { id: true, note: true, coveredBy: true, removedByName: true },
    });
  }

  return NextResponse.json({ ok: true, removal });
}
