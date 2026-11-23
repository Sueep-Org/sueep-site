import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canMarkScheduleDayComplete } from "@/lib/erpAuth";
import { parseDateKey } from "@/lib/erp/janitorialSchedule";
import { markSovItemsComplete } from "@/lib/erp/sovComplete";
import { updateCompletedScopeItems } from "@/lib/erp/turnoverScopeServer";

/**
 * Mark one day of a job or change order complete on the schedule (POST), or
 * undo it (DELETE). Body: { projectId, changeOrderId?, date: "YYYY-MM-DD",
 * completeSovItemIds?: string[], completeScopeItems?: string[] }. The day
 * itself is only a record; the whole job is completed on its page. On a job's
 * day, the SOV lines (post-construction) or turnover scope items (CLEAN, PAINT…)
 * the user ticked are marked complete too; undoing the day leaves them complete. Admin, PM, Business
 * Manager, Sales and Supervisors.
 */
async function parse(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canMarkScheduleDayComplete(auth.role)) {
    return { error: NextResponse.json({ error: "You can't mark days complete." }, { status: 403 }) };
  }
  const body = (await req.json().catch(() => ({}))) as { projectId?: unknown; changeOrderId?: unknown; date?: unknown; completeSovItemIds?: unknown; completeScopeItems?: unknown };
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const changeOrderId = typeof body.changeOrderId === "string" && body.changeOrderId ? body.changeOrderId : null;
  const date = parseDateKey(body.date);
  if (!projectId || !date) return { error: NextResponse.json({ error: "projectId and date are required" }, { status: 400 }) };
  const dateKey = String(body.date);
  const key = changeOrderId ? `co:${changeOrderId}:${dateKey}` : `p:${projectId}:${dateKey}`;
  const completeSovItemIds = Array.isArray(body.completeSovItemIds)
    ? body.completeSovItemIds.filter((v): v is string => typeof v === "string").slice(0, 200)
    : [];
  const completeScopeItems = Array.isArray(body.completeScopeItems)
    ? body.completeScopeItems.filter((v): v is string => typeof v === "string").slice(0, 50)
    : [];
  return { auth, projectId, changeOrderId, date, key, completeSovItemIds, completeScopeItems };
}

export async function POST(req: Request) {
  const p = await parse(req);
  if ("error" in p) return p.error;
  if (p.changeOrderId) {
    const co = await prisma.projectChangeOrder.findFirst({ where: { id: p.changeOrderId, projectId: p.projectId }, select: { id: true } });
    if (!co) return NextResponse.json({ error: "Change order not found" }, { status: 404 });
  } else if (!(await prisma.project.findUnique({ where: { id: p.projectId }, select: { id: true } }))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const emp = await prisma.employee.findFirst({
    where: { email: { equals: p.auth.email, mode: "insensitive" } },
    select: { firstName: true, lastName: true },
  });
  const completedByName = (emp ? `${emp.firstName} ${emp.lastName}`.trim() : "") || p.auth.email.split("@")[0]!;
  const row = await prisma.scheduleDayCompletion.upsert({
    where: { key: p.key },
    create: { key: p.key, projectId: p.projectId, changeOrderId: p.changeOrderId, date: p.date, completedBy: p.auth.email, completedByName },
    update: {},
  });
  // SOV lines belong to the job, not a change order, so only on a job's day.
  const sovMarked = p.changeOrderId ? [] : await markSovItemsComplete(p.projectId, p.completeSovItemIds, p.date);
  // A turn's scope items; the unit itself is still completed on its page (checklist rules apply there).
  const scope = !p.changeOrderId && p.completeScopeItems.length ? await updateCompletedScopeItems(p.projectId, { add: p.completeScopeItems }) : null;
  return NextResponse.json({
    ok: true,
    completedByName: row.completedByName,
    completedAt: row.createdAt.toISOString(),
    sovMarked,
    completedScopeItems: scope?.ok ? scope.completedScopeItems : null,
  });
}

export async function DELETE(req: Request) {
  const p = await parse(req);
  if ("error" in p) return p.error;
  await prisma.scheduleDayCompletion.deleteMany({ where: { key: p.key } });
  return NextResponse.json({ ok: true });
}
