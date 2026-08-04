import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { buildDayAssignmentInvite, buildScheduleSeriesInvite } from "@/lib/calendarInvite";
import { dayKey } from "@/lib/erp/schedule";
import { computeSeriesDates, parseDatesList, SeriesDateRangeError } from "@/lib/erp/scheduleSeries";
import { formatTurnoverHoursBudgetText } from "@/lib/erp/turnoverHoursBudget";
import { isTurnoverScopeValue } from "@/lib/erp/turnoverScope";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function extractEmailAddress(raw: string | undefined): string {
  if (!raw) return "noreply@sueep.com";
  const match = raw.match(/<([^>]+)>/);
  return match ? match[1]! : raw.trim();
}

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

  // A supervisor/PM isn't required — SOV items, scope, change orders, or a
  // comment alone are enough to record coverage for the day — but there has
  // to be *something*, otherwise this would just create an empty row.
  if (
    !supervisorUserId &&
    !projectManagerUserId &&
    sovItemIds.length === 0 &&
    scopeItems.length === 0 &&
    changeOrderIds.length === 0 &&
    !comment
  ) {
    return NextResponse.json(
      { error: "Provide a supervisor, PM, SOV item(s), scope, change order(s), or a comment" },
      { status: 400 }
    );
  }

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
      },
    }),
    supervisorUserId ? prisma.erpUser.findUnique({ where: { id: supervisorUserId }, select: { id: true, email: true } }) : null,
    projectManagerUserId ? prisma.erpUser.findUnique({ where: { id: projectManagerUserId }, select: { id: true, email: true } }) : null,
  ]);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (supervisorUserId && !supervisor) return NextResponse.json({ error: "Supervisor not found" }, { status: 404 });
  if (projectManagerUserId && !projectManager) return NextResponse.json({ error: "PM not found" }, { status: 404 });

  if (sovItemIds.length > 0) {
    const found = await prisma.projectSOVItem.count({ where: { id: { in: sovItemIds }, sov: { projectId } } });
    if (found !== sovItemIds.length) return NextResponse.json({ error: "SOV item not found" }, { status: 404 });
  }
  if (changeOrderIds.length > 0) {
    const found = await prisma.projectChangeOrder.count({ where: { id: { in: changeOrderIds }, projectId } });
    if (found !== changeOrderIds.length) return NextResponse.json({ error: "Change order not found" }, { status: 404 });
  }

  // Building.address has far broader coverage than the work-order siteAddress
  // (most projects are linked to a Building), so prefer it and fall back.
  const location = project.building?.address || project.workOrderRecord?.siteAddress || undefined;

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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";

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
    const assignments = supervisorUserId
      ? (await prisma.$transaction([prisma.project.update({ where: { id: projectId }, data: { supervisorUserId } }), ...writes])).slice(1)
      : await prisma.$transaction(writes);

    // No calendar invite for a PM-only series, see the field comment above.
    if (supervisorUserId && supervisor) {
      try {
        const hoursBudgetText = await hoursBudgetTextFor(seriesDates[0]!);
        const descriptionLines = [
          `Project: ${project.jobTitle}`,
          ...(hoursBudgetText ? ["", hoursBudgetText] : []),
          ...(appUrl ? ["", `${appUrl}/erp/projects/${projectId}`] : []),
        ];
        const ics = buildScheduleSeriesInvite({
          uid: `day-assignment-series-${series.id}@sueep.com`,
          firstDateKey: dayKey(seriesDates[0]!),
          lastDateKey: dayKey(repeatUntil),
          repeatDays,
          startTime,
          endTime,
          summary: `Supervising: ${project.jobTitle}`,
          description: descriptionLines.join("\n"),
          location,
          url: appUrl ? `${appUrl}/erp/projects/${projectId}` : undefined,
          organizerEmail: extractEmailAddress(process.env.RESEND_FROM),
          organizerName: "Sueep Schedule",
          attendeeEmail: supervisor.email,
        });
        const budgetHtml = hoursBudgetText ? `<p>${hoursBudgetText.replace(/\n/g, "<br>")}</p>` : "";
        await sendEmail({
          to: supervisor.email,
          subject: `You're assigned: ${project.jobTitle}, ${dayKey(seriesDates[0]!)} through ${dayKey(repeatUntil)}`,
          html: `<p>You've been assigned to <strong>${project.jobTitle}</strong>, repeating from ${dayKey(seriesDates[0]!)} through ${dayKey(repeatUntil)}. Add the attached invite to your calendar.</p>${budgetHtml}`,
          attachments: [{ filename: "invite.ics", content: Buffer.from(ics) }],
        });
      } catch (e) {
        console.error("Failed to send schedule-series calendar invite", e);
      }
    }

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
  // same project/day) updates the existing calendar event instead of adding
  // a duplicate. Email delivery failures shouldn't block the assignment. No
  // invite for a PM-only day, see the projectManagerUserId comment above.
  if (supervisorUserId && supervisor) {
    try {
      const hoursBudgetText = await hoursBudgetTextFor(date);
      const descriptionLines = [
        `Project: ${project.jobTitle}`,
        ...(hoursBudgetText ? ["", hoursBudgetText] : []),
        ...(appUrl ? ["", `${appUrl}/erp/projects/${projectId}`] : []),
      ];
      const ics = buildDayAssignmentInvite({
        uid: `day-assignment-${assignment.id}@sueep.com`,
        dateKey: dayKey(assignment.date),
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        summary: `Supervising: ${project.jobTitle}`,
        description: descriptionLines.join("\n"),
        location,
        url: appUrl ? `${appUrl}/erp/projects/${projectId}` : undefined,
        organizerEmail: extractEmailAddress(process.env.RESEND_FROM),
        organizerName: "Sueep Schedule",
        attendeeEmail: supervisor.email,
      });
      const budgetHtml = hoursBudgetText
        ? `<p>${hoursBudgetText.replace(/\n/g, "<br>")}</p>`
        : "";
      await sendEmail({
        to: supervisor.email,
        subject: `You're assigned: ${project.jobTitle} on ${dayKey(assignment.date)}`,
        html: `<p>You've been assigned to <strong>${project.jobTitle}</strong> on ${dayKey(assignment.date)}. Add the attached invite to your calendar.</p>${budgetHtml}`,
        attachments: [{ filename: "invite.ics", content: Buffer.from(ics) }],
      });
    } catch (e) {
      console.error("Failed to send day-assignment calendar invite", e);
    }
  }

  return NextResponse.json(assignment, { status: 201 });
}
