import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dayKey } from "@/lib/erp/schedule";
import { computeSeriesDates, parseDatesList, SeriesDateRangeError } from "@/lib/erp/scheduleSeries";
import { formatTurnoverHoursBudgetText } from "@/lib/erp/turnoverHoursBudget";
import { isTurnoverScopeValue, parseCompletedScopeItems, turnoverScopeLabel } from "@/lib/erp/turnoverScope";
import { appUrl, notifyProjectCrew, scopeText, sendDayInvite } from "@/lib/erp/scheduleInvites";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const projectId = String(body.projectId || "").trim();
  const supervisorUserId = String(body.supervisorUserId || "").trim() || null;
  // Rare case: only the PM covers a day, no supervisor. Not synced onto
  // Project (unlike supervisorUserId below) and no calendar-invite email
  // goes out for it, calendar/day-assignment concept only.
  const projectManagerUserId = String(body.projectManagerUserId || "").trim() || null;
  const dateRaw = String(body.date || "").trim();
  const comment = typeof body.comment === "string" && body.comment.trim() ? body.comment.trim() : null;
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  // An explicit, possibly non-consecutive list of dates (the calendar's
  // "duplicate to more days" picker) takes priority over date/repeatUntil/
  // repeatDays below when present — date becomes just the earliest of them.
  const datesListRaw = Array.isArray(body.dates)
    ? body.dates.map((v) => String(v).trim()).filter(Boolean)
    : null;

  let date: Date;
  let explicitDatesList: Date[] | null = null;
  if (datesListRaw && datesListRaw.length > 0) {
    try {
      explicitDatesList = parseDatesList(datesListRaw);
    } catch (err) {
      if (err instanceof SeriesDateRangeError) return NextResponse.json({ error: err.message }, { status: 400 });
      throw err;
    }
    date = explicitDatesList[0]!;
  } else {
    if (!dateRaw) return NextResponse.json({ error: "date is required" }, { status: 400 });
    date = new Date(`${dateRaw}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  let startTime: string | null = null;
  let endTime: string | null = null;
  if (body.startTime || body.endTime) {
    startTime = String(body.startTime || "").trim();
    endTime = String(body.endTime || "").trim();
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
      return NextResponse.json({ error: "startTime and endTime must both be HH:MM" }, { status: 400 });
    }
    if (endTime <= startTime) {
      return NextResponse.json({ error: "endTime must be after startTime" }, { status: 400 });
    }
  }

  // A multi-day range, weekly repeat, or explicit (possibly non-consecutive)
  // date list — see ProjectScheduleSeries. All are absent for the plain
  // single-day assign, which keeps behaving exactly as it did before this
  // was added. repeatUntil/repeatDays on the series row are derived from
  // the explicit list (last date / distinct weekdays present) purely for
  // record-keeping and the calendar-invite text below — the real source of
  // truth for which days got a row is explicitDatesList itself.
  const repeatUntilRaw = String(body.repeatUntil || "").trim();
  const repeatDaysRaw = Array.isArray(body.repeatDays) ? body.repeatDays : null;
  let seriesDates: Date[] | null = null;
  let repeatUntil: Date | null = null;
  let repeatDays: number[] = [];
  if (explicitDatesList) {
    seriesDates = explicitDatesList;
    repeatUntil = explicitDatesList[explicitDatesList.length - 1]!;
    repeatDays = [...new Set(explicitDatesList.map((d) => d.getUTCDay()))].sort((a, b) => a - b);
  } else if (repeatUntilRaw || repeatDaysRaw) {
    if (!repeatUntilRaw) return NextResponse.json({ error: "repeatUntil is required when repeatDays is set" }, { status: 400 });
    if (!repeatDaysRaw || repeatDaysRaw.length === 0) {
      return NextResponse.json({ error: "repeatDays is required when repeatUntil is set" }, { status: 400 });
    }
    repeatUntil = new Date(`${repeatUntilRaw}T00:00:00.000Z`);
    if (Number.isNaN(repeatUntil.getTime())) return NextResponse.json({ error: "Invalid repeatUntil" }, { status: 400 });
    repeatDays = repeatDaysRaw.map((d) => Number(d));
    if (repeatDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      return NextResponse.json({ error: "repeatDays must be integers 0-6" }, { status: 400 });
    }
    try {
      seriesDates = computeSeriesDates(date, repeatUntil, repeatDays);
    } catch (err) {
      if (err instanceof SeriesDateRangeError) return NextResponse.json({ error: err.message }, { status: 400 });
      throw err;
    }
    if (seriesDates.length === 0) {
      return NextResponse.json({ error: "No dates in range match the selected weekdays" }, { status: 400 });
    }
  }

  const sovItemIds = Array.isArray(body.sovItemIds)
    ? [...new Set(body.sovItemIds.map((v) => String(v).trim()).filter(Boolean))]
    : [];
  const scopeItems = Array.isArray(body.scopeItems)
    ? [...new Set(body.scopeItems.map((v) => String(v).trim()).filter(isTurnoverScopeValue))]
    : [];
  const changeOrderIds = Array.isArray(body.changeOrderIds)
    ? [...new Set(body.changeOrderIds.map((v) => String(v).trim()).filter(Boolean))]
    : [];

  // A supervisor/PM/SOV/scope/CO/comment are all optional. A project can be
  // put on the calendar for a day with none of them set, just to hold the
  // day, and it renders the same as any other planned assignment (with a
  // "no supervisor assigned" warning on the chip). The only thing actually
  // required is a project and a date, both already validated above.

  const [project, supervisor, projectManager] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        jobTitle: true,
        turnoverRequestId: true,
        contractValueCents: true,
        building: { select: { address: true } },
        workOrderRecord: { select: { siteAddress: true } },
        turnoverRequest: { select: { completedScopeItems: true } },
      },
    }),
    supervisorUserId ? prisma.erpUser.findUnique({ where: { id: supervisorUserId }, select: { id: true, email: true } }) : null,
    projectManagerUserId ? prisma.erpUser.findUnique({ where: { id: projectManagerUserId }, select: { id: true, email: true } }) : null,
  ]);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (supervisorUserId && !supervisor) return NextResponse.json({ error: "Supervisor not found" }, { status: 404 });
  if (projectManagerUserId && !projectManager) return NextResponse.json({ error: "PM not found" }, { status: 404 });

  // Also doubles as the source for the SOV item descriptions used in the
  // invite's "Scope:" line below, so this fetches the full rows rather than
  // just a count.
  let sovDescriptions: string[] = [];
  if (sovItemIds.length > 0) {
    const found = await prisma.projectSOVItem.findMany({
      where: { id: { in: sovItemIds }, sov: { projectId } },
      select: { description: true },
    });
    if (found.length !== sovItemIds.length) return NextResponse.json({ error: "SOV item not found" }, { status: 404 });
    sovDescriptions = found.map((s) => s.description);
  }
  if (changeOrderIds.length > 0) {
    const found = await prisma.projectChangeOrder.count({ where: { id: { in: changeOrderIds }, projectId } });
    if (found !== changeOrderIds.length) return NextResponse.json({ error: "Change order not found" }, { status: 404 });
  }
  // A scope item already marked complete (see /projects/[id]/scope-items)
  // can't be put back on the calendar, that's the whole point of marking it
  // done. Checked server-side too, not just filtered out of the picker.
  if (scopeItems.length > 0 && project.turnoverRequest) {
    const completed = parseCompletedScopeItems(project.turnoverRequest.completedScopeItems);
    const blocked = scopeItems.filter((s) => completed.includes(s));
    if (blocked.length > 0) {
      return NextResponse.json(
        { error: `${blocked.map(turnoverScopeLabel).join(", ")} already marked complete, can't be scheduled` },
        { status: 400 }
      );
    }
  }

  // Building.address has far broader coverage than the work-order siteAddress
  // (most projects are linked to a Building), so prefer it and fall back.
  const location = project.building?.address || project.workOrderRecord?.siteAddress || undefined;
  // What this day's work actually is, shown as visible text (not just
  // buried in the .ics) on both the supervisor's invite and every crew
  // member's — see notifyProjectCrew for how a worker's own SOV/scope
  // split overrides this when they're individually tagged.
  const dayScopeText = scopeText(sovDescriptions, scopeItems.map(turnoverScopeLabel));

  // Turnovers only, for now. The crew-hours budget assumes the turnover
  // pricing model (contractValueCents ~= 2x target labor cost). Non-turnover
  // projects (recurring contracts, PDF-estimator commercial jobs) don't have
  // that relationship and would need their own derivation.
  async function hoursBudgetTextFor(onDate: Date): Promise<string | null> {
    if (!project!.turnoverRequestId || !project!.contractValueCents) return null;
    const scheduledCrewSize = await prisma.projectWorkerDayAssignment.count({
      where: { projectId, date: onDate },
    });
    return formatTurnoverHoursBudgetText(project!.contractValueCents, scheduledCrewSize);
  }

  const url = appUrl() ? `${appUrl()}/erp/projects/${projectId}` : undefined;

  if (seriesDates && repeatUntil) {
    const series = await prisma.projectScheduleSeries.create({
      data: { projectId, supervisorUserId, projectManagerUserId, startDate: date, endDate: repeatUntil, repeatDays, startTime, endTime },
    });

    // Assigning a supervisor here also makes them the project's supervisor on
    // the project details page (Project.supervisorUserId), same field the
    // Gantt's inline reassignment dropdown writes to. Last assignment wins,
    // consistent with that dropdown's behavior. Skipped for a PM-only series,
    // there's no project-level PM field to sync to.
    const writes = seriesDates.map((d) =>
      prisma.projectDayAssignment.upsert({
        where: { projectId_date: { projectId, date: d } },
        create: {
          projectId, date: d, supervisorUserId, projectManagerUserId, startTime, endTime, seriesId: series.id,
          scopeItems, comment,
          sovItems: sovItemIds.length > 0 ? { connect: sovItemIds.map((id) => ({ id })) } : undefined,
          changeOrders: changeOrderIds.length > 0 ? { connect: changeOrderIds.map((id) => ({ id })) } : undefined,
        },
        update: {
          supervisorUserId, projectManagerUserId, startTime, endTime, seriesId: series.id,
          scopeItems, comment,
          sovItems: { set: sovItemIds.map((id) => ({ id })) },
          changeOrders: { set: changeOrderIds.map((id) => ({ id })) },
        },
        include: { sovItems: { select: { id: true } }, changeOrders: { select: { id: true } } },
      })
    );
    // `.slice(1)` on a $transaction([Project.update, ...writes]) tuple loses
    // Prisma's precise per-element typing (TS widens it to a Project |
    // ProjectDayAssignment union) — the cast below restores the real shape,
    // which is genuinely always ProjectDayAssignment past index 0.
    const assignments = (supervisorUserId
      ? (await prisma.$transaction([prisma.project.update({ where: { id: projectId }, data: { supervisorUserId } }), ...writes])).slice(1)
      : await prisma.$transaction(writes)) as Awaited<(typeof writes)[number]>[];

    // No calendar invite for a PM-only series, see the field comment above.
    // One email per occurrence, each with its own accept/decline link, so
    // the supervisor can respond to each day independently (accept Monday,
    // decline Wednesday) — not one combined recurring invite for the whole
    // range like this used to send.
    if (supervisorUserId && supervisor) {
      await Promise.all(
        assignments.map(async (a) => {
          const hoursBudgetText = await hoursBudgetTextFor(a.date);
          await sendDayInvite({
            uid: `day-assignment-${a.id}@sueep.com`,
            to: supervisor.email,
            role: "Supervising",
            title: project.jobTitle,
            dateKey: dayKey(a.date),
            startTime,
            endTime,
            location,
            scopeText: dayScopeText,
            url,
            extraHtml: hoursBudgetText ? `<p>${hoursBudgetText.replace(/\n/g, "<br>")}</p>` : undefined,
          });
        })
      );
    }

    // Refreshes the invite for every crew member already on one of these
    // days — their own time/scope may have just changed even though their
    // ProjectWorkerDayAssignment row wasn't touched by this request.
    await notifyProjectCrew({
      projectId,
      dates: seriesDates,
      projectTitle: project.jobTitle,
      location,
      startTime,
      endTime,
      daySovDescriptions: sovDescriptions,
      dayScopeLabels: scopeItems.map(turnoverScopeLabel),
      url,
    });

    return NextResponse.json({ seriesId: series.id, assignments }, { status: 201 });
  }

  const writeAssignment = prisma.projectDayAssignment.upsert({
    where: { projectId_date: { projectId, date } },
    create: {
      projectId, date, supervisorUserId, projectManagerUserId, startTime, endTime,
      scopeItems, comment,
      sovItems: sovItemIds.length > 0 ? { connect: sovItemIds.map((id) => ({ id })) } : undefined,
      changeOrders: changeOrderIds.length > 0 ? { connect: changeOrderIds.map((id) => ({ id })) } : undefined,
    },
    update: {
      supervisorUserId, projectManagerUserId, startTime, endTime,
      scopeItems, comment,
      sovItems: { set: sovItemIds.map((id) => ({ id })) },
      changeOrders: { set: changeOrderIds.map((id) => ({ id })) },
    },
    include: { sovItems: { select: { id: true } }, changeOrders: { select: { id: true } } },
  });
  const assignment = supervisorUserId
    ? (await prisma.$transaction([writeAssignment, prisma.project.update({ where: { id: projectId }, data: { supervisorUserId } })]))[0]
    : await writeAssignment;

  // Send a calendar invite (.ics) for the assignment. Reuses the same UID on
  // every send for this assignment, so re-running this (e.g. reassigning the
  // same project/day, or just editing its scope/time) updates the existing
  // calendar event instead of adding a duplicate. No invite for a PM-only
  // day, see the projectManagerUserId comment above.
  if (supervisorUserId && supervisor) {
    const hoursBudgetText = await hoursBudgetTextFor(date);
    await sendDayInvite({
      uid: `day-assignment-${assignment.id}@sueep.com`,
      to: supervisor.email,
      role: "Supervising",
      title: project.jobTitle,
      dateKey: dayKey(assignment.date),
      startTime: assignment.startTime,
      endTime: assignment.endTime,
      location,
      scopeText: dayScopeText,
      url,
      extraHtml: hoursBudgetText ? `<p>${hoursBudgetText.replace(/\n/g, "<br>")}</p>` : undefined,
    });
  }

  // Same refresh as the series branch above, just for this one day.
  await notifyProjectCrew({
    projectId,
    dates: [date],
    projectTitle: project.jobTitle,
    location,
    startTime: assignment.startTime,
    endTime: assignment.endTime,
    daySovDescriptions: sovDescriptions,
    dayScopeLabels: scopeItems.map(turnoverScopeLabel),
    url,
  });

  return NextResponse.json(assignment, { status: 201 });
}
