import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dollarsToCents } from "@/lib/erp/money";
import { syncSovPercentDone } from "@/lib/sovSync";
import { sendEmail, buildTurnoverMarginAlertEmail } from "@/lib/email";
import {
  turnoverTotalHoursBudget,
  turnoverImpliedMarginPct,
  turnoverMarginSeverity,
  turnoverMarginWorsened,
} from "@/lib/erp/turnoverHoursBudget";
import { TRANSPORTATION_METHODS } from "@/lib/erp/transportationMethods";
import { ALL_CHECKLIST_ITEM_IDS } from "@/lib/erp/unitTurnoverChecklistTemplate";
import { getErpAuth, canOverrideQualityChecklist, canOverrideSafetyCheck } from "@/lib/erpAuth";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";
import { todayEasternKey } from "@/lib/erp/dates";

/** Same "Label: value" line format used to embed a Sueep PM name in the
 * description for older projects that predate the dedicated supervisor
 * field (duplicated from the same helper in pm-view/page.tsx, ProjectsExpandableTable.tsx,
 * and projects/[id]/page.tsx). */
function getDescLine(description: string | null, key: string): string {
  if (!description) return "";
  const prefix = `${key}:`;
  return (
    description
      .split(/\r?\n/)
      .find((line) => line.trim().toLowerCase().startsWith(prefix.toLowerCase()))
      ?.replace(new RegExp(`^${key}:\\s*`, "i"), "")
      .trim() ?? ""
  );
}

/** Same rule projects/[id]/page.tsx uses to derive isPostConstruction for the
 * safety-checklist banner: absent a configured post-construction pipeline id,
 * every project is treated as post-construction. */
function isPostConstructionProject(hubspotPipelineId: string | null): boolean {
  const cfg = parseHubSpotPipelineStageMap();
  return cfg?.postConstruction.pipelineId ? hubspotPipelineId === cfg.postConstruction.pipelineId : true;
}

async function findEmployeeEmailByName(fullName: string): Promise<string | null> {
  const [firstName, ...rest] = fullName.trim().split(" ");
  const lastName = rest.join(" ");
  const emp = await prisma.employee.findFirst({
    where: { firstName: { equals: firstName, mode: "insensitive" }, lastName: { equals: lastName, mode: "insensitive" }, email: { not: null } },
    select: { email: true },
  });
  return emp?.email ?? null;
}

async function notifyPmIfMarginWorsened(projectId: string, priorHours: number, newHours: number) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      jobTitle: true,
      turnoverRequestId: true,
      contractValueCents: true,
      supervisor: true,
      description: true,
      supervisorUser: { select: { email: true } },
    },
  });
  if (!project || !project.turnoverRequestId || !project.contractValueCents) return;

  const hoursBudget = turnoverTotalHoursBudget(project.contractValueCents);
  const priorSeverity = turnoverMarginSeverity(turnoverImpliedMarginPct(project.contractValueCents, priorHours));
  const newMarginPct = turnoverImpliedMarginPct(project.contractValueCents, newHours);
  const newSeverity = turnoverMarginSeverity(newMarginPct);
  if (!turnoverMarginWorsened(priorSeverity, newSeverity) || newSeverity === "on-track") return;

  // The Sueep PM on a turnover, same person shown in the "PM" column on the
  // projects table, is Project.supervisor (a name string) or, for older
  // projects, a "SUEEP PM:" line in the description. That is a different
  // person from supervisorUser (Project.supervisorUserId), the ERP login
  // assigned via the schedule/calendar-invite flow for on-site coverage, so
  // it's only used here as a last-resort fallback.
  let recipient: string | null = null;
  const pmName = project.supervisor?.trim() || getDescLine(project.description, "SUEEP PM");
  if (pmName) recipient = await findEmployeeEmailByName(pmName);
  if (!recipient) recipient = project.supervisorUser?.email ?? null;
  if (!recipient) recipient = (process.env.DOCUSEAL_SUEEP_SIGNER_EMAIL ?? "david@sueep.com").trim();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  try {
    await sendEmail({
      to: recipient,
      subject: `Margin alert: ${project.jobTitle}`,
      html: buildTurnoverMarginAlertEmail({
        jobTitle: project.jobTitle,
        severity: newSeverity,
        hoursLogged: newHours,
        hoursBudget,
        marginPct: newMarginPct,
        projectUrl: appUrl ? `${appUrl}/erp/projects/${projectId}` : null,
      }),
    });
  } catch (e) {
    console.error("Failed to send turnover margin alert email", e);
  }
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const entries = await prisma.laborEntry.findMany({
    where: { projectId: id },
    orderBy: { workDate: "desc" },
  });
  return NextResponse.json(entries);
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, supervisor: true, segment: true, hubspotPipelineId: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const needsOverrideCheck = project.segment === "JANITORIAL_TURNOVER_REQUESTS" || isPostConstructionProject(project.hubspotPipelineId);
  const auth = needsOverrideCheck ? await getErpAuth() : null;
  if (needsOverrideCheck && !auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // A turnover unit's quality checklist has to be finished before any labor
  // gets logged against it at all, not just before it's marked complete —
  // unless the acting user is a PM/ADMIN, who can log through it regardless.
  if (project.segment === "JANITORIAL_TURNOVER_REQUESTS" && !canOverrideQualityChecklist(auth!.role)) {
    const checklist = await prisma.unitTurnoverChecklist.findUnique({ where: { projectId: id }, select: { completedItems: true } });
    const completed = (checklist?.completedItems ?? {}) as Record<string, boolean>;
    const allDone = ALL_CHECKLIST_ITEM_IDS.every((itemId) => completed[itemId]);
    if (!allDone) {
      return NextResponse.json(
        { error: "Finish the quality checklist before logging labor on this unit. A PM can override if needed." },
        { status: 400 },
      );
    }
  }

  // A post-construction project needs today's daily safety check approved
  // before any labor gets logged — unless the acting user is a PM/ADMIN, who
  // can log through it regardless.
  if (isPostConstructionProject(project.hubspotPipelineId) && !canOverrideSafetyCheck(auth!.role)) {
    const todayKey = todayEasternKey();
    const checksToday = await prisma.dailySafetyCheck.findMany({
      where: { projectId: id },
      select: { checkDate: true, approvedForWork: true },
    });
    const approvedToday = checksToday.some(
      (c) => c.approvedForWork && todayEasternKey(c.checkDate) === todayKey,
    );
    if (!approvedToday) {
      return NextResponse.json(
        { error: "Today's safety checklist has not been approved. Complete and approve it before logging labor. A PM can override if needed." },
        { status: 400 },
      );
    }
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const workerName = String(body.workerName || "").trim();
  if (!workerName) return NextResponse.json({ error: "workerName is required" }, { status: 400 });

  const workDateRaw = body.workDate;
  if (typeof workDateRaw !== "string" || !workDateRaw) {
    return NextResponse.json({ error: "workDate is required (ISO date)" }, { status: 400 });
  }
  const workDate = new Date(`${workDateRaw}T00:00:00-05:00`);
  if (Number.isNaN(workDate.getTime())) {
    return NextResponse.json({ error: "Invalid workDate" }, { status: 400 });
  }

  const hours = typeof body.hours === "number" ? body.hours : Number(body.hours);
  if (!Number.isFinite(hours) || hours <= 0) {
    return NextResponse.json({ error: "hours must be a positive number" }, { status: 400 });
  }

  const clockIn = typeof body.clockIn === "string" && /^\d{2}:\d{2}$/.test(body.clockIn) ? body.clockIn : null;

  let commuteHours: number | null = null;
  if (body.commuteHours !== undefined && body.commuteHours !== null && body.commuteHours !== "") {
    const c = Number(body.commuteHours);
    if (!Number.isFinite(c) || c < 0) return NextResponse.json({ error: "Invalid commuteHours" }, { status: 400 });
    if (c > hours) return NextResponse.json({ error: "commuteHours cannot exceed hours" }, { status: 400 });
    commuteHours = c;
  }

  const transportationMethodRaw = body.transportationMethod ? String(body.transportationMethod).toUpperCase() : null;
  if (!transportationMethodRaw) {
    return NextResponse.json({ error: "transportationMethod is required" }, { status: 400 });
  }
  if (!TRANSPORTATION_METHODS.includes(transportationMethodRaw as (typeof TRANSPORTATION_METHODS)[number])) {
    return NextResponse.json({ error: "Invalid transportationMethod" }, { status: 400 });
  }
  const transportationMethod = transportationMethodRaw;

  let hourlyRateCents: number;
  if (typeof body.hourlyRateCents === "number" && Number.isFinite(body.hourlyRateCents)) {
    hourlyRateCents = Math.round(body.hourlyRateCents);
  } else if (typeof body.hourlyRate === "number" && Number.isFinite(body.hourlyRate)) {
    hourlyRateCents = dollarsToCents(body.hourlyRate);
  } else if (typeof body.hourlyRate === "string") {
    const n = Number(String(body.hourlyRate).replace(/[$,]/g, ""));
    if (!Number.isFinite(n)) return NextResponse.json({ error: "Invalid hourlyRate" }, { status: 400 });
    hourlyRateCents = dollarsToCents(n);
  } else {
    return NextResponse.json({ error: "hourlyRate or hourlyRateCents required" }, { status: 400 });
  }

  if (hourlyRateCents < 0) return NextResponse.json({ error: "Invalid rate" }, { status: 400 });

  const employeeId = body.employeeId != null ? String(body.employeeId).trim() : "";
  let employee: { id: string; firstName: string; lastName: string; email: string | null } | null = null;
  if (employeeId) {
    employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  // No labor can be logged on a project with no PM assigned, except by a
  // SUPERVISOR-role ERP user logging their own hours, which auto-assigns them
  // as the PM instead of blocking them, so the very first entry on a new
  // project doesn't get stuck needing a PM that only labor logging can set.
  if (!project.supervisor || !project.supervisor.trim()) {
    // Covers both an employee picked from the roster (employeeId set) and a
    // free-typed "Other" worker name that happens to match a real employee
    // (findEmployeeEmailByName, same lookup used for PM-alert recipients).
    const candidateEmail = employee?.email ?? (await findEmployeeEmailByName(workerName));
    const candidateName = employee ? `${employee.firstName} ${employee.lastName}`.trim() : workerName;
    let autoAssignName: string | null = null;
    if (candidateEmail) {
      const erpUser = await prisma.erpUser.findFirst({
        where: { email: { equals: candidateEmail, mode: "insensitive" } },
        select: { role: true },
      });
      if (erpUser?.role === "SUPERVISOR") {
        autoAssignName = candidateName;
      }
    }
    if (!autoAssignName) {
      return NextResponse.json(
        { error: "This project needs a supervisor (PM) assigned before labor can be logged." },
        { status: 400 },
      );
    }
    await prisma.project.update({ where: { id }, data: { supervisor: autoAssignName } });
  }

  // Location support
  const locationLatitude = body.locationLatitude != null ? parseFloat(String(body.locationLatitude)) : null;
  const locationLongitude = body.locationLongitude != null ? parseFloat(String(body.locationLongitude)) : null;
  const locationAccuracy = body.locationAccuracy != null ? parseFloat(String(body.locationAccuracy)) : null;

  const sovItemId = body.sovItemId ? String(body.sovItemId).trim() : null;
  if (sovItemId) {
    const sovItem = await prisma.projectSOVItem.findFirst({ where: { id: sovItemId, sov: { projectId: id } }, select: { id: true } });
    if (!sovItem) return NextResponse.json({ error: "SOV item not found" }, { status: 404 });
  }

  const priorHoursAgg = await prisma.laborEntry.aggregate({ where: { projectId: id }, _sum: { hours: true } });
  const priorHours = priorHoursAgg._sum.hours ?? 0;

  try {
    const entry = await prisma.laborEntry.create({
      data: {
        projectId: id,
        employeeId: employeeId || null,
        workDate,
        workerName,
        role: body.role != null ? String(body.role).trim() || null : null,
        hours,
        clockIn,
        commuteHours,
        transportationMethod,
        hourlyRateCents,
        taskDescription: body.taskDescription != null ? String(body.taskDescription).trim() || null : null,
        sovItemId: sovItemId || null,
        locationLatitude: Number.isFinite(locationLatitude) ? locationLatitude : null,
        locationLongitude: Number.isFinite(locationLongitude) ? locationLongitude : null,
        locationAccuracy: Number.isFinite(locationAccuracy) ? locationAccuracy : null,
        lastLocationAt: (Number.isFinite(locationLatitude) && Number.isFinite(locationLongitude)) ? new Date() : null,
      },
    });
    if (sovItemId && body.sovCompleted !== undefined) {
      await prisma.projectSOVItem.update({ where: { id: sovItemId }, data: { completed: Boolean(body.sovCompleted) } });
      await syncSovPercentDone(id);
    }
    try {
      await notifyPmIfMarginWorsened(id, priorHours, priorHours + hours);
    } catch (e) {
      console.error("Turnover margin PM alert failed", e);
    }
    return NextResponse.json(entry);
  } catch (e) {
    console.error("POST labor", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
