import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeSeriesDates, parseDatesList, SeriesDateRangeError } from "@/lib/erp/scheduleSeries";

/** Exactly one of employeeId/contractorId is ever set per row, this builds
 * the right upsert shape (and compound-unique key) for whichever it is. */
function workerUpsertArgs(
  projectId: string,
  date: Date,
  employeeId: string | null,
  contractorId: string | null,
  seriesId: string | null
): Prisma.ProjectWorkerDayAssignmentUpsertArgs {
  if (employeeId) {
    return {
      where: { projectId_employeeId_date: { projectId, employeeId, date } },
      create: { projectId, employeeId, date, seriesId },
      update: { seriesId },
    };
  }
  return {
    where: { projectId_contractorId_date: { projectId, contractorId: contractorId!, date } },
    create: { projectId, contractorId, date, seriesId },
    update: { seriesId },
  };
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const projectId = String(body.projectId || "").trim();
  const employeeId = String(body.employeeId || "").trim() || null;
  const contractorId = String(body.contractorId || "").trim() || null;
  const dateRaw = String(body.date || "").trim();
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  if (!employeeId && !contractorId) {
    return NextResponse.json({ error: "employeeId or contractorId is required" }, { status: 400 });
  }
  if (employeeId && contractorId) {
    return NextResponse.json({ error: "Only one of employeeId or contractorId may be set" }, { status: 400 });
  }
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

  const [project, employee, contractor] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }),
    employeeId
      ? prisma.employee.findUnique({
          where: { id: employeeId },
          select: { id: true, firstName: true, lastName: true, backgroundCheckStatus: true },
        })
      : null,
    contractorId ? prisma.contractor.findUnique({ where: { id: contractorId }, select: { id: true } }) : null,
  ]);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const worker = employeeId ? employee : contractor;
  if (!worker) return NextResponse.json({ error: employeeId ? "Employee not found" : "Contractor not found" }, { status: 404 });
  // Only a FAILED result blocks scheduling. PENDING/NOT_DONE/PASSED (or no
  // check on file at all) shouldn't stop someone from being put on the
  // calendar, only a confirmed failure should.
  if (employee && employee.backgroundCheckStatus === "FAILED") {
    return NextResponse.json(
      { error: `${employee.firstName} ${employee.lastName} failed their background check and cannot be scheduled.` },
      { status: 409 }
    );
  }

  // Adding a worker to an active repeat range: either an existing series id
  // (a supervisor was already assigned to this range in the same modal
  // session, see day-assignments/route.ts) or a fresh repeatUntil/repeatDays
  // pair when a crew is scheduled onto a range with no supervisor yet.
  const seriesIdRaw = String(body.seriesId || "").trim();
  const repeatUntilRaw = String(body.repeatUntil || "").trim();
  const repeatDaysRaw = Array.isArray(body.repeatDays) ? body.repeatDays : null;

  let seriesId: string | null = null;
  let seriesDates: Date[] | null = null;

  if (seriesIdRaw) {
    const series = await prisma.projectScheduleSeries.findUnique({ where: { id: seriesIdRaw } });
    if (!series || series.projectId !== projectId) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }
    seriesId = series.id;
    // The series' startDate/endDate/repeatDays no longer necessarily describe
    // a clean weekly pattern — an explicit (possibly non-consecutive) date
    // list collapses to the same shape (see day-assignments/route.ts), so
    // recomputing from them here could invent extra dates nobody picked. The
    // day-assignment rows this series actually generated are the source of
    // truth for which days it covers.
    const existingDayAssignments = await prisma.projectDayAssignment.findMany({
      where: { seriesId: series.id },
      select: { date: true },
    });
    seriesDates =
      existingDayAssignments.length > 0
        ? existingDayAssignments.map((a) => a.date)
        : computeSeriesDates(series.startDate, series.endDate, series.repeatDays);
  } else if (explicitDatesList) {
    seriesDates = explicitDatesList;
    const series = await prisma.projectScheduleSeries.create({
      data: {
        projectId,
        startDate: explicitDatesList[0]!,
        endDate: explicitDatesList[explicitDatesList.length - 1]!,
        repeatDays: [...new Set(explicitDatesList.map((d) => d.getUTCDay()))].sort((a, b) => a - b),
      },
    });
    seriesId = series.id;
  } else if (repeatUntilRaw || repeatDaysRaw) {
    if (!repeatUntilRaw) return NextResponse.json({ error: "repeatUntil is required when repeatDays is set" }, { status: 400 });
    if (!repeatDaysRaw || repeatDaysRaw.length === 0) {
      return NextResponse.json({ error: "repeatDays is required when repeatUntil is set" }, { status: 400 });
    }
    const repeatUntil = new Date(`${repeatUntilRaw}T00:00:00.000Z`);
    if (Number.isNaN(repeatUntil.getTime())) return NextResponse.json({ error: "Invalid repeatUntil" }, { status: 400 });
    const repeatDays = repeatDaysRaw.map((d) => Number(d));
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
    const series = await prisma.projectScheduleSeries.create({
      data: { projectId, startDate: date, endDate: repeatUntil, repeatDays },
    });
    seriesId = series.id;
  }

  // No notification is sent here (unlike the supervisor day-assignment
  // route, which emails a calendar invite) — may be added later.
  if (seriesDates && seriesId) {
    const assignments = await prisma.$transaction(
      seriesDates.map((d) => prisma.projectWorkerDayAssignment.upsert(workerUpsertArgs(projectId, d, employeeId, contractorId, seriesId)))
    );
    return NextResponse.json({ seriesId, assignments }, { status: 201 });
  }

  const assignment = await prisma.projectWorkerDayAssignment.upsert(workerUpsertArgs(projectId, date, employeeId, contractorId, null));

  return NextResponse.json(assignment, { status: 201 });
}
