import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { buildDayAssignmentInvite, buildScheduleSeriesInvite } from "@/lib/calendarInvite";
import { dayKey } from "@/lib/erp/schedule";
import { computeSeriesDates, SeriesDateRangeError } from "@/lib/erp/scheduleSeries";
import { formatTurnoverHoursBudgetText } from "@/lib/erp/turnoverHoursBudget";

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
  const supervisorUserId = String(body.supervisorUserId || "").trim();
  const dateRaw = String(body.date || "").trim();
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  if (!supervisorUserId) return NextResponse.json({ error: "supervisorUserId is required" }, { status: 400 });
  if (!dateRaw) return NextResponse.json({ error: "date is required" }, { status: 400 });

  const date = new Date(`${dateRaw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });

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

  // A multi-day range or weekly repeat, see ProjectScheduleSeries. Both are
  // absent for the plain single-day assign, which keeps behaving exactly as
  // it did before this was added.
  const repeatUntilRaw = String(body.repeatUntil || "").trim();
  const repeatDaysRaw = Array.isArray(body.repeatDays) ? body.repeatDays : null;
  let seriesDates: Date[] | null = null;
  let repeatUntil: Date | null = null;
  let repeatDays: number[] = [];
  if (repeatUntilRaw || repeatDaysRaw) {
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

  const [project, supervisor] = await Promise.all([
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
    prisma.erpUser.findUnique({ where: { id: supervisorUserId }, select: { id: true, email: true } }),
  ]);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!supervisor) return NextResponse.json({ error: "Supervisor not found" }, { status: 404 });

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
      data: { projectId, supervisorUserId, startDate: date, endDate: repeatUntil, repeatDays, startTime, endTime },
    });

    // Assigning a supervisor here also makes them the project's supervisor on
    // the project details page (Project.supervisorUserId), same field the
    // Gantt's inline reassignment dropdown writes to. Last assignment wins,
    // consistent with that dropdown's behavior.
    const [, ...assignments] = await prisma.$transaction([
      prisma.project.update({ where: { id: projectId }, data: { supervisorUserId } }),
      ...seriesDates.map((d) =>
        prisma.projectDayAssignment.upsert({
          where: { projectId_date: { projectId, date: d } },
          create: { projectId, date: d, supervisorUserId, startTime, endTime, seriesId: series.id },
          update: { supervisorUserId, startTime, endTime, seriesId: series.id },
        })
      ),
    ]);

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

    return NextResponse.json({ seriesId: series.id, assignments }, { status: 201 });
  }

  const [assignment] = await prisma.$transaction([
    prisma.projectDayAssignment.upsert({
      where: { projectId_date: { projectId, date } },
      create: { projectId, date, supervisorUserId, startTime, endTime },
      update: { supervisorUserId, startTime, endTime },
    }),
    prisma.project.update({ where: { id: projectId }, data: { supervisorUserId } }),
  ]);

  // Send a calendar invite (.ics) for the assignment. Reuses the same UID on
  // every send for this assignment, so re-running this (e.g. reassigning the
  // same project/day) updates the existing calendar event instead of adding
  // a duplicate. Email delivery failures shouldn't block the assignment.
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

  return NextResponse.json(assignment, { status: 201 });
}
