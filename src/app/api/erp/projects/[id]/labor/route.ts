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
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
  if (employeeId) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
    if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
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
