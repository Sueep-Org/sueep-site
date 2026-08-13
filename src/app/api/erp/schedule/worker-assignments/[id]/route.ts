import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dayKey } from "@/lib/erp/schedule";
import { isTurnoverScopeValue, turnoverScopeLabel } from "@/lib/erp/turnoverScope";
import { appUrl, resolveWorkerContact, scopeText, sendDayInvite } from "@/lib/erp/scheduleInvites";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  const existing = await prisma.projectWorkerDayAssignment.findUnique({
    where: { id },
    select: {
      date: true,
      employeeId: true,
      contractorId: true,
      seriesId: true,
      project: {
        select: {
          jobTitle: true,
          building: { select: { address: true } },
          workOrderRecord: { select: { siteAddress: true } },
        },
      },
    },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.projectWorkerDayAssignment.delete({ where: { id } }).catch(() => {});

  // A row created as part of a series was only ever sent one combined
  // recurring invite (see worker-assignments' POST route, workerSeriesUid)
  // — removing just this one occurrence has no clean single-event
  // cancellation to send without touching the whole series' invite, so it's
  // skipped here. "Remove all" (the series DELETE route) is what sends that
  // cancellation, for the whole range at once.
  if (!existing.seriesId) {
    const contact = await resolveWorkerContact(existing.employeeId, existing.contractorId);
    if (contact) {
      const location = existing.project.building?.address || existing.project.workOrderRecord?.siteAddress || undefined;
      await sendDayInvite({
        uid: `worker-assignment-${id}@sueep.com`,
        to: contact.email,
        attendeeName: contact.name,
        role: "Working",
        title: existing.project.jobTitle,
        dateKey: dayKey(existing.date),
        location,
        cancelled: true,
      });
    }
  }

  return NextResponse.json({ ok: true });
}

/** Reassigns which SOV item / turnover scope an already-added worker covers
 * for their day — e.g. the day's scope was split after the crew was
 * already added, or a worker needs to be moved from one scope to another.
 * Only touches assignedSovItemId/assignedScopeItem, nothing else about the
 * row. Sending `null` clears it (falls back to "covers everything"). Also
 * resends that worker's invite so it reflects the change — same "keep it
 * updated" rule every other schedule-notification path follows. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = await prisma.projectWorkerDayAssignment.findUnique({
    where: { id },
    select: {
      projectId: true,
      date: true,
      employeeId: true,
      contractorId: true,
      project: {
        select: {
          jobTitle: true,
          building: { select: { address: true } },
          workOrderRecord: { select: { siteAddress: true } },
        },
      },
    },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: { assignedSovItemId?: string | null; assignedScopeItem?: string | null } = {};
  let sovDescription: string | null = null;

  if ("assignedSovItemId" in body) {
    const raw = String(body.assignedSovItemId || "").trim() || null;
    if (raw) {
      const sovItem = await prisma.projectSOVItem.findFirst({
        where: { id: raw, sov: { projectId: existing.projectId } },
        select: { description: true },
      });
      if (!sovItem) return NextResponse.json({ error: "SOV item not found" }, { status: 404 });
      sovDescription = sovItem.description;
    }
    data.assignedSovItemId = raw;
  }

  if ("assignedScopeItem" in body) {
    const raw = String(body.assignedScopeItem || "").trim() || null;
    if (raw && !isTurnoverScopeValue(raw)) {
      return NextResponse.json({ error: "Invalid assignedScopeItem" }, { status: 400 });
    }
    data.assignedScopeItem = raw;
  }

  const updated = await prisma.projectWorkerDayAssignment.update({ where: { id }, data });

  const contact = await resolveWorkerContact(existing.employeeId, existing.contractorId);
  if (contact) {
    const location = existing.project.building?.address || existing.project.workOrderRecord?.siteAddress || undefined;
    const ownScope = sovDescription ?? (data.assignedScopeItem ? turnoverScopeLabel(data.assignedScopeItem) : null);
    // Day-level time/scope, also used as the scope fallback when this
    // change cleared the worker's own split back to "unassigned" — same
    // rule the initial invite (worker-assignments POST) and
    // notifyProjectCrew both use.
    const dayAssignment = await prisma.projectDayAssignment.findUnique({
      where: { projectId_date: { projectId: existing.projectId, date: existing.date } },
      select: { startTime: true, endTime: true, scopeItems: true, sovItems: { select: { description: true } } },
    });
    const fallbackScope = dayAssignment
      ? scopeText(dayAssignment.sovItems.map((s) => s.description), dayAssignment.scopeItems.map(turnoverScopeLabel))
      : null;
    await sendDayInvite({
      uid: `worker-assignment-${id}@sueep.com`,
      to: contact.email,
      attendeeName: contact.name,
      role: "Working",
      title: existing.project.jobTitle,
      dateKey: dayKey(existing.date),
      startTime: dayAssignment?.startTime ?? null,
      endTime: dayAssignment?.endTime ?? null,
      location,
      scopeText: ownScope ?? fallbackScope,
      url: appUrl() ? `${appUrl()}/erp/projects/${existing.projectId}` : undefined,
    });
  }

  return NextResponse.json(updated);
}
