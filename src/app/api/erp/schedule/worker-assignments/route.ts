import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dayKey } from "@/lib/erp/schedule";
import { computeSeriesDates, parseDatesList, SeriesDateRangeError } from "@/lib/erp/scheduleSeries";
import { getErpAuth, canOverridePto, canOverrideBackgroundCheck } from "@/lib/erpAuth";
import { isTurnoverScopeValue, turnoverScopeLabel } from "@/lib/erp/turnoverScope";
import { appUrl, resolveWorkerContact, scopeText, sendDayInvite, sendSeriesInvite, workerSeriesUid } from "@/lib/erp/scheduleInvites";

/** Exactly one of employeeId/contractorId is ever set per row, this builds
 * the right upsert shape (and compound-unique key) for whichever it is.
 * `undefined` for assignedSovItemId/assignedScopeItem means "not sent in
 * this request, leave whatever's already there alone" (e.g. the
 * date-change/series-duplicate carry-over paths, which don't know about a
 * scope split yet) — only `null` or a real value actually touches the
 * column on an update. Always set (to `null` if unset) on create, since
 * there's nothing to preserve yet. */
function workerUpsertArgs(
  projectId: string,
  date: Date,
  employeeId: string | null,
  contractorId: string | null,
  seriesId: string | null,
  assignedSovItemId: string | null | undefined,
  assignedScopeItem: string | null | undefined
): Prisma.ProjectWorkerDayAssignmentUpsertArgs {
  const scopeUpdateFields = {
    ...(assignedSovItemId !== undefined ? { assignedSovItemId } : {}),
    ...(assignedScopeItem !== undefined ? { assignedScopeItem } : {}),
  };
  if (employeeId) {
    return {
      where: { projectId_employeeId_date: { projectId, employeeId, date } },
      create: { projectId, employeeId, date, seriesId, assignedSovItemId: assignedSovItemId ?? null, assignedScopeItem: assignedScopeItem ?? null },
      update: { seriesId, ...scopeUpdateFields },
    };
  }
  return {
    where: { projectId_contractorId_date: { projectId, contractorId: contractorId!, date } },
    create: { projectId, contractorId, date, seriesId, assignedSovItemId: assignedSovItemId ?? null, assignedScopeItem: assignedScopeItem ?? null },
    update: { seriesId, ...scopeUpdateFields },
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
  // Which SOV item / turnover scope this worker covers this day, when the
  // day itself has more than one picked (see ProjectDayAssignment.sovItems /
  // .scopeItems) — undefined (key not sent at all) leaves whatever's
  // already on the row alone, see workerUpsertArgs above.
  const assignedSovItemId =
    "assignedSovItemId" in body ? String(body.assignedSovItemId || "").trim() || null : undefined;
  const assignedScopeItem =
    "assignedScopeItem" in body ? String(body.assignedScopeItem || "").trim() || null : undefined;
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  if (!employeeId && !contractorId) {
    return NextResponse.json({ error: "employeeId or contractorId is required" }, { status: 400 });
  }
  if (employeeId && contractorId) {
    return NextResponse.json({ error: "Only one of employeeId or contractorId may be set" }, { status: 400 });
  }
  if (assignedScopeItem && !isTurnoverScopeValue(assignedScopeItem)) {
    return NextResponse.json({ error: "Invalid assignedScopeItem" }, { status: 400 });
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

  // Fetched once up front and reused by both the background-check gate below
  // and the PTO gate further down, they share the same PM/ADMIN/SALES
  // override role set.
  const auth = await getErpAuth();

  const [project, employee, contractor] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        jobTitle: true,
        building: { select: { address: true } },
        workOrderRecord: { select: { siteAddress: true } },
      },
    }),
    employeeId
      ? prisma.employee.findUnique({
          where: { id: employeeId },
          select: { id: true, firstName: true, lastName: true, backgroundCheckStatus: true },
        })
      : null,
    contractorId
      ? prisma.contractor.findUnique({
          where: { id: contractorId },
          select: { id: true, name: true, backgroundCheckStatus: true },
        })
      : null,
  ]);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  // Also doubles as the source for the assigned SOV item's description,
  // used in the invite's "Scope:" line below.
  let assignedSovDescription: string | null = null;
  if (assignedSovItemId) {
    const sovItem = await prisma.projectSOVItem.findFirst({
      where: { id: assignedSovItemId, sov: { projectId } },
      select: { description: true },
    });
    if (!sovItem) return NextResponse.json({ error: "SOV item not found" }, { status: 404 });
    assignedSovDescription = sovItem.description;
  }
  const worker = employeeId ? employee : contractor;
  if (!worker) return NextResponse.json({ error: employeeId ? "Employee not found" : "Contractor not found" }, { status: 404 });
  // Only a FAILED result blocks scheduling. PENDING/NOT_DONE/PASSED (or no
  // check on file at all) shouldn't stop someone from being put on the
  // calendar, only a confirmed failure should. Applies to both employees and
  // contractors, they're scheduled through this same endpoint. PM/ADMIN/SALES
  // can override, same as the PTO gate below.
  const workerName = employee ? `${employee.firstName} ${employee.lastName}` : contractor?.name;
  if (worker.backgroundCheckStatus === "FAILED" && (!auth || !canOverrideBackgroundCheck(auth.role))) {
    return NextResponse.json(
      {
        error: `${workerName} failed their background check and can't be assigned. A PM or Admin can override.`,
      },
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
  // Only ever non-null via the seriesIdRaw branch below — a fresh series
  // created straight from this route (the other two branches) never has a
  // time set, this endpoint doesn't accept one, so the crew invite is
  // all-day in that case, same as everywhere else time is optional.
  let seriesStartTime: string | null = null;
  let seriesEndTime: string | null = null;

  if (seriesIdRaw) {
    const series = await prisma.projectScheduleSeries.findUnique({ where: { id: seriesIdRaw } });
    if (!series || series.projectId !== projectId) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }
    seriesId = series.id;
    seriesStartTime = series.startTime;
    seriesEndTime = series.endTime;
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

  // A worker with time off logged over any of the day(s) being scheduled
  // can't be assigned, same 409-and-explain shape as the background-check
  // guard above, checked against every date in the batch (not just the
  // anchor date), a repeat/duplicate range could still land on a PTO day
  // even if the first day doesn't. Applies to both employees and contractors
  // (EmployeeTimeOff / ContractorTimeOff are separate tables, same shape).
  // PM/ADMIN/SALES can override, same role set as the quality-checklist/
  // safety-check gates.
  if ((employeeId || contractorId) && (!auth || !canOverridePto(auth.role))) {
    const datesToCheck = seriesDates ?? [date];
    const overlapWhere = { OR: datesToCheck.map((d) => ({ startDate: { lte: d }, endDate: { gte: d } })) };
    const conflictingPto = employeeId
      ? await prisma.employeeTimeOff.findFirst({ where: { employeeId, ...overlapWhere } })
      : await prisma.contractorTimeOff.findFirst({ where: { contractorId: contractorId!, ...overlapWhere } });
    if (conflictingPto) {
      return NextResponse.json(
        { error: `${workerName} has time off scheduled and can't be assigned. A PM or Admin can override.` },
        { status: 409 }
      );
    }
  }

  const location = project.building?.address || project.workOrderRecord?.siteAddress || undefined;
  const url = appUrl() ? `${appUrl()}/erp/projects/${projectId}` : undefined;
  // The worker's own split wins; a day-level fallback (looked up per date
  // below, single-day path only) covers everyone else.
  const ownScope = assignedSovDescription ?? (assignedScopeItem ? turnoverScopeLabel(assignedScopeItem) : null);
  const contact = await resolveWorkerContact(employeeId, contractorId);

  if (seriesDates && seriesId) {
    const assignments = await prisma.$transaction(
      seriesDates.map((d) =>
        prisma.projectWorkerDayAssignment.upsert(
          workerUpsertArgs(projectId, d, employeeId, contractorId, seriesId, assignedSovItemId, assignedScopeItem)
        )
      )
    );

    // One combined recurring invite covering the whole range, same as the
    // supervisor's series invite — not one email per day.
    if (contact) {
      await sendSeriesInvite({
        uid: workerSeriesUid(seriesId, employeeId, contractorId),
        to: contact.email,
        attendeeName: contact.name,
        role: "Working",
        title: project.jobTitle,
        firstDateKey: dayKey(seriesDates[0]!),
        lastDateKey: dayKey(seriesDates[seriesDates.length - 1]!),
        repeatDays: [...new Set(seriesDates.map((d) => d.getUTCDay()))],
        startTime: seriesStartTime,
        endTime: seriesEndTime,
        location,
        scopeText: ownScope,
        url,
      });
    }

    return NextResponse.json({ seriesId, assignments }, { status: 201 });
  }

  const assignment = await prisma.projectWorkerDayAssignment.upsert(
    workerUpsertArgs(projectId, date, employeeId, contractorId, null, assignedSovItemId, assignedScopeItem)
  );

  if (contact) {
    // Day-level scope/time, for when this worker isn't individually split
    // onto their own SOV item / turnover scope — same source the
    // day-assignment modal's "Task details" section reads from.
    const dayAssignment = await prisma.projectDayAssignment.findUnique({
      where: { projectId_date: { projectId, date } },
      select: { startTime: true, endTime: true, scopeItems: true, sovItems: { select: { description: true } } },
    });
    const dayScope = dayAssignment
      ? scopeText(dayAssignment.sovItems.map((s) => s.description), dayAssignment.scopeItems.map(turnoverScopeLabel))
      : null;
    await sendDayInvite({
      uid: `worker-assignment-${assignment.id}@sueep.com`,
      to: contact.email,
      attendeeName: contact.name,
      role: "Working",
      title: project.jobTitle,
      dateKey: dayKey(assignment.date),
      startTime: dayAssignment?.startTime ?? null,
      endTime: dayAssignment?.endTime ?? null,
      location,
      scopeText: ownScope ?? dayScope,
      url,
    });
  }

  return NextResponse.json(assignment, { status: 201 });
}
