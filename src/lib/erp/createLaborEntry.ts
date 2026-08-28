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
import { checklistCompletionPct, CHECKLIST_LABOR_THRESHOLD_PCT } from "@/lib/erp/unitTurnoverChecklistTemplate";
import { canOverrideQualityChecklist, canOverrideSafetyCheck, type ErpAuthContext } from "@/lib/erpAuth";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";
import { todayEasternKey } from "@/lib/erp/dates";
import { ENFORCE_LABOR_CHECKLIST_GATES } from "@/lib/erp/laborChecklistGates";
import { getDescLine } from "@/lib/erp/descLine";
import type { LaborEntry } from "@prisma/client";

export { getDescLine };

/** Same rule projects/[id]/page.tsx uses to derive isPostConstruction for the
 * safety-checklist banner: absent a configured post-construction pipeline id,
 * every project is treated as post-construction. */
function isPostConstructionProject(hubspotPipelineId: string | null): boolean {
  const cfg = parseHubSpotPipelineStageMap();
  return cfg?.postConstruction.pipelineId ? hubspotPipelineId === cfg.postConstruction.pipelineId : true;
}

export async function findEmployeeEmailByName(fullName: string): Promise<string | null> {
  const [firstName, ...rest] = fullName.trim().split(" ");
  const lastName = rest.join(" ");
  const emp = await prisma.employee.findFirst({
    where: {
      firstName: { equals: firstName, mode: "insensitive" },
      lastName: { equals: lastName, mode: "insensitive" },
      email: { not: null },
      status: { not: "INACTIVE" },
    },
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

export type CreateLaborEntryResult =
  | { ok: true; entry: LaborEntry & { sovItems: { id: string }[] } }
  | { ok: false; status: number; error: string };

/**
 * Shared by the single-project labor route and the building-level bulk
 * "log hours split across units" route, so both go through the exact same
 * per-project gating (quality checklist %, daily safety check, PM
 * auto-assign) and margin-alert logic.
 */
export async function createLaborEntryForProject(
  projectId: string,
  body: Record<string, unknown>,
  auth: ErpAuthContext | null,
): Promise<CreateLaborEntryResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, supervisor: true, segment: true, hubspotPipelineId: true },
  });
  if (!project) return { ok: false, status: 404, error: "Not found" };

  const needsOverrideCheck = ENFORCE_LABOR_CHECKLIST_GATES && (project.segment === "JANITORIAL_TURNOVER_REQUESTS" || isPostConstructionProject(project.hubspotPipelineId));
  if (needsOverrideCheck && !auth) return { ok: false, status: 401, error: "Unauthorized" };

  // A turnover unit's quality checklist has to be at least mostly done before
  // any labor gets logged against it — not fully finished, just past the
  // threshold — unless the acting user is a PM/ADMIN, who can log through it
  // regardless.
  if (ENFORCE_LABOR_CHECKLIST_GATES && project.segment === "JANITORIAL_TURNOVER_REQUESTS" && !canOverrideQualityChecklist(auth!.role)) {
    const checklist = await prisma.unitTurnoverChecklist.findUnique({ where: { projectId }, select: { completedItems: true } });
    const completed = (checklist?.completedItems ?? {}) as Record<string, boolean>;
    if (checklistCompletionPct(completed) < CHECKLIST_LABOR_THRESHOLD_PCT) {
      return {
        ok: false,
        status: 400,
        error: `The quality checklist needs to be at least ${CHECKLIST_LABOR_THRESHOLD_PCT}% complete before logging labor on this unit. A PM can override if needed.`,
      };
    }
  }

  // A post-construction project needs today's daily safety check approved
  // before any labor gets logged — unless the acting user is a PM/ADMIN, who
  // can log through it regardless.
  if (ENFORCE_LABOR_CHECKLIST_GATES && isPostConstructionProject(project.hubspotPipelineId) && !canOverrideSafetyCheck(auth!.role)) {
    const todayKey = todayEasternKey();
    const checksToday = await prisma.dailySafetyCheck.findMany({
      where: { projectId },
      select: { checkDate: true, approvedForWork: true },
    });
    const approvedToday = checksToday.some(
      (c) => c.approvedForWork && todayEasternKey(c.checkDate) === todayKey,
    );
    if (!approvedToday) {
      return {
        ok: false,
        status: 400,
        error: "Today's safety checklist has not been approved. Complete and approve it before logging labor. A PM can override if needed.",
      };
    }
  }

  const workerName = String(body.workerName || "").trim();
  if (!workerName) return { ok: false, status: 400, error: "workerName is required" };

  const workDateRaw = body.workDate;
  if (typeof workDateRaw !== "string" || !workDateRaw) {
    return { ok: false, status: 400, error: "workDate is required (ISO date)" };
  }
  const workDate = new Date(`${workDateRaw}T00:00:00-05:00`);
  if (Number.isNaN(workDate.getTime())) {
    return { ok: false, status: 400, error: "Invalid workDate" };
  }

  const hours = typeof body.hours === "number" ? body.hours : Number(body.hours);
  if (!Number.isFinite(hours) || hours <= 0) {
    return { ok: false, status: 400, error: "hours must be a positive number" };
  }

  const clockIn = typeof body.clockIn === "string" && /^\d{2}:\d{2}$/.test(body.clockIn) ? body.clockIn : null;

  let commuteHours: number | null = null;
  if (body.commuteHours !== undefined && body.commuteHours !== null && body.commuteHours !== "") {
    const c = Number(body.commuteHours);
    if (!Number.isFinite(c) || c < 0) return { ok: false, status: 400, error: "Invalid commuteHours" };
    if (c > hours) return { ok: false, status: 400, error: "commuteHours cannot exceed hours" };
    commuteHours = c;
  }

  const transportationMethodRaw = body.transportationMethod ? String(body.transportationMethod).toUpperCase() : null;
  if (!transportationMethodRaw) {
    return { ok: false, status: 400, error: "transportationMethod is required" };
  }
  if (!TRANSPORTATION_METHODS.includes(transportationMethodRaw as (typeof TRANSPORTATION_METHODS)[number])) {
    return { ok: false, status: 400, error: "Invalid transportationMethod" };
  }
  const transportationMethod = transportationMethodRaw;

  let hourlyRateCents: number;
  if (typeof body.hourlyRateCents === "number" && Number.isFinite(body.hourlyRateCents)) {
    hourlyRateCents = Math.round(body.hourlyRateCents);
  } else if (typeof body.hourlyRate === "number" && Number.isFinite(body.hourlyRate)) {
    hourlyRateCents = dollarsToCents(body.hourlyRate);
  } else if (typeof body.hourlyRate === "string") {
    const n = Number(String(body.hourlyRate).replace(/[$,]/g, ""));
    if (!Number.isFinite(n)) return { ok: false, status: 400, error: "Invalid hourlyRate" };
    hourlyRateCents = dollarsToCents(n);
  } else {
    return { ok: false, status: 400, error: "hourlyRate or hourlyRateCents required" };
  }

  if (hourlyRateCents < 0) return { ok: false, status: 400, error: "Invalid rate" };

  const employeeId = body.employeeId != null ? String(body.employeeId).trim() : "";
  let employee: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    status: string;
    statusSource: string;
  } | null = null;
  if (employeeId) {
    employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, firstName: true, lastName: true, email: true, status: true, statusSource: true },
    });
    if (!employee) return { ok: false, status: 404, error: "Employee not found" };
  }

  // If a SUPERVISOR-role ERP user logs their own hours on a project with no
  // PM assigned yet, auto-assign them as the PM. Purely a convenience so the
  // project ends up with a supervisor of record; logging labor is never
  // blocked on this.
  if (!project.supervisor || !project.supervisor.trim()) {
    // Covers both an employee picked from the roster (employeeId set) and a
    // free-typed "Other" worker name that happens to match a real employee
    // (findEmployeeEmailByName, same lookup used for PM-alert recipients).
    const candidateEmail = employee?.email ?? (await findEmployeeEmailByName(workerName));
    const candidateName = employee ? `${employee.firstName} ${employee.lastName}`.trim() : workerName;
    if (candidateEmail) {
      const erpUser = await prisma.erpUser.findFirst({
        where: { email: { equals: candidateEmail, mode: "insensitive" } },
        select: { role: true },
      });
      if (erpUser?.role === "SUPERVISOR") {
        await prisma.project.update({ where: { id: projectId }, data: { supervisor: candidateName } });
      }
    }
  }

  // Location support
  const locationLatitude = body.locationLatitude != null ? parseFloat(String(body.locationLatitude)) : null;
  const locationLongitude = body.locationLongitude != null ? parseFloat(String(body.locationLongitude)) : null;
  const locationAccuracy = body.locationAccuracy != null ? parseFloat(String(body.locationAccuracy)) : null;

  const sovItemIds = Array.isArray(body.sovItemIds)
    ? [...new Set(body.sovItemIds.map((v) => String(v).trim()).filter(Boolean))]
    : [];
  if (sovItemIds.length > 0) {
    const found = await prisma.projectSOVItem.findMany({ where: { id: { in: sovItemIds }, sov: { projectId } }, select: { id: true } });
    if (found.length !== sovItemIds.length) return { ok: false, status: 404, error: "SOV item not found" };
  }
  const sovCompletedIds = new Set(
    Array.isArray(body.sovCompletedIds) ? body.sovCompletedIds.map((v) => String(v).trim()) : []
  );

  const priorHoursAgg = await prisma.laborEntry.aggregate({ where: { projectId }, _sum: { hours: true } });
  const priorHours = priorHoursAgg._sum.hours ?? 0;

  try {
    const entry = await prisma.laborEntry.create({
      data: {
        projectId,
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
        sovItems: sovItemIds.length > 0 ? { connect: sovItemIds.map((id) => ({ id })) } : undefined,
        locationLatitude: Number.isFinite(locationLatitude) ? locationLatitude : null,
        locationLongitude: Number.isFinite(locationLongitude) ? locationLongitude : null,
        locationAccuracy: Number.isFinite(locationAccuracy) ? locationAccuracy : null,
        lastLocationAt: (Number.isFinite(locationLatitude) && Number.isFinite(locationLongitude)) ? new Date() : null,
      },
      include: { sovItems: { select: { id: true } } },
    });
    if (sovCompletedIds.size > 0) {
      const idsToComplete = sovItemIds.filter((id) => sovCompletedIds.has(id));
      if (idsToComplete.length > 0) {
        await prisma.projectSOVItem.updateMany({ where: { id: { in: idsToComplete } }, data: { completed: true } });
        await syncSovPercentDone(projectId);
      }
    }
    try {
      await notifyPmIfMarginWorsened(projectId, priorHours, priorHours + hours);
    } catch (e) {
      console.error("Turnover margin PM alert failed", e);
    }
    // Auto-reactivate an employee the inactivity cron flagged Inactive (see
    // src/lib/erp/employeeInactivity.ts) — they just logged real labor, so
    // the condition that flagged them no longer holds. Never touches an
    // employee a person manually marked Inactive (statusSource "MANUAL"),
    // that decision only a person can undo. statusSource stays "AUTO" so a
    // future dry spell can flag them again without anyone re-touching this.
    if (employee?.status === "INACTIVE" && employee.statusSource === "AUTO") {
      try {
        await prisma.employee.update({
          where: { id: employee.id },
          data: { status: "ACTIVE", statusChangedAt: new Date() },
        });
      } catch (e) {
        console.error("Employee auto-reactivation failed", e);
      }
    }
    return { ok: true, entry };
  } catch (e) {
    console.error("createLaborEntryForProject", e);
    return { ok: false, status: 500, error: "Create failed" };
  }
}
