/**
 * Property managers cancelling or moving turnovers from their link. A
 * request staff haven't confirmed yet changes right away. A confirmed unit
 * only gets a PropertyManagerChange, which staff apply or decline, so the
 * unit and its crew never change without someone at Sueep checking.
 * Server only.
 */

import { prisma } from "@/lib/prisma";
import { buildPropertyManagerChangeAnsweredEmail, buildPropertyManagerChangeEmail, sendEmail } from "@/lib/email";
import { todayEasternKey, utcDateKey } from "./dates";
import { deriveProjectLifecycle } from "./projectLifecycle";
import { emailExtrasFor, type LinkedManager } from "./propertyManagerAccess";
import { turnoverCalendarAttachment } from "./propertyManagerRequests";
import { changeDeadline } from "./propertyManagerRequestShared";

type Result<T = { ok: true }> = T | { error: string };

function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
}

function dayValue(v: unknown): Date | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDay(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function firstName(name: string): string {
  return name.split(" ")[0] || name;
}

function erpRequestsUrl(): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://app.sueep.com").replace(/\/$/, "");
  return `${appUrl}/erp/property-managers/requests`;
}

async function emailStaff(subject: string, title: string, lines: string[]) {
  try {
    await sendEmail({
      type: "PROPERTY_MANAGER_CHANGE_REQUESTED",
      link: "/erp/property-managers/requests",
      subject,
      html: buildPropertyManagerChangeEmail({ title, lines, url: erpRequestsUrl() }),
    });
  } catch (e) {
    console.error("Property manager change email failed:", e);
  }
}

async function managerBuildingIds(managerId: string): Promise<string[]> {
  const links = await prisma.propertyManagerBuilding.findMany({ where: { propertyManagerId: managerId }, select: { buildingId: true } });
  return links.map((l) => l.buildingId);
}

/** A request still waiting on staff, at one of this property manager's buildings. */
async function findOpenRequest(manager: LinkedManager, requestId: string) {
  const request = await prisma.propertyManagerRequest.findUnique({ where: { id: requestId }, include: { building: { select: { name: true } } } });
  if (!request || !(await managerBuildingIds(manager.id)).includes(request.buildingId)) return null;
  if (request.source === "WEBSITE" && request.requesterEmail !== manager.email) return null;
  return request;
}

export async function cancelPendingRequest(manager: LinkedManager, requestId: string): Promise<Result> {
  const request = await findOpenRequest(manager, requestId);
  if (!request) return { error: "Request not found" };
  const updated = await prisma.propertyManagerRequest.updateMany({
    where: { id: requestId, status: "REQUESTED" },
    data: { status: "CANCELLED", decidedBy: manager.email, decidedAt: new Date() },
  });
  if (!updated.count) return { error: "Sueep already answered this request. Refresh to see it." };
  await emailStaff(`Request cancelled: ${request.building.name} #${request.unitNumber}`, "Turnover request cancelled", [
    `${manager.name} cancelled their request for ${request.building.name} #${request.unitNumber} (${formatDay(request.requestedStartDate)}). Nothing to do.`,
  ]);
  return { ok: true };
}

export async function moveRequestDate(manager: LinkedManager, requestId: string, body: Record<string, unknown>): Promise<Result> {
  const request = await findOpenRequest(manager, requestId);
  if (!request) return { error: "Request not found" };
  const start = dayValue(body.requestedStartDate);
  if (!start) return { error: "Pick a date" };
  if (utcDateKey(start) < todayEasternKey()) return { error: "The date can't be in the past" };
  if (request.moveInDate && start > request.moveInDate) return { error: "That's after move-in. Pick an earlier date." };
  if (start.getTime() === request.requestedStartDate.getTime()) return { ok: true };

  const updated = await prisma.propertyManagerRequest.updateMany({ where: { id: requestId, status: "REQUESTED" }, data: { requestedStartDate: start } });
  if (!updated.count) return { error: "Sueep already answered this request. Refresh to see it." };
  await emailStaff(`New date: ${request.building.name} #${request.unitNumber}`, "Turnover request date changed", [
    `${manager.name} moved their request for ${request.building.name} #${request.unitNumber} from ${formatDay(request.requestedStartDate)} to ${formatDay(start)}. It's still waiting for someone to confirm.`,
  ]);
  return { ok: true };
}

/** A confirmed unit at one of their buildings that hasn't started, and is still before the change deadline. */
async function findChangeableUnit(manager: LinkedManager, projectId: string): Promise<Result<{ project: { id: string; jobTitle: string; buildingId: string; projectDate: Date } }>> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, jobTitle: true, buildingId: true, status: true, segment: true, turnoverRequestId: true, projectDate: true },
  });
  if (
    !project?.buildingId ||
    !project.projectDate ||
    project.segment !== "JANITORIAL_TURNOVER_REQUESTS" ||
    !project.turnoverRequestId ||
    !(await managerBuildingIds(manager.id)).includes(project.buildingId)
  ) {
    return { error: "Turnover not found" };
  }
  if (deriveProjectLifecycle(project.status, project.projectDate.toISOString()) !== "UPCOMING") {
    return { error: "This turnover has already started. Contact Sueep to change it." };
  }
  if (new Date() > changeDeadline(utcDateKey(project.projectDate))) {
    return { error: "It's too close to the start to change it here. Contact Sueep." };
  }
  return { project: { id: project.id, jobTitle: project.jobTitle, buildingId: project.buildingId, projectDate: project.projectDate } };
}

export async function askForChange(manager: LinkedManager, projectId: string, body: Record<string, unknown>): Promise<Result> {
  const found = await findChangeableUnit(manager, projectId);
  if ("error" in found) return found;
  const { project } = found;

  const kind = body.kind === "CANCEL" ? "CANCEL" : body.kind === "RESCHEDULE" ? "RESCHEDULE" : null;
  if (!kind) return { error: "Pick cancel or a new date" };
  const newStartDate = kind === "RESCHEDULE" ? dayValue(body.newStartDate) : null;
  if (kind === "RESCHEDULE") {
    if (!newStartDate) return { error: "Pick the new date" };
    if (utcDateKey(newStartDate) <= todayEasternKey()) return { error: "Pick a date after today" };
    if (newStartDate.getTime() === project.projectDate.getTime()) return { error: "That's the date it's already on" };
  }
  const reason = text(body.reason, 1000);

  const open = await prisma.propertyManagerChange.findFirst({ where: { projectId, status: "OPEN" }, select: { id: true } });
  if (open) return { error: "There's already a change waiting for Sueep on this turnover" };

  await prisma.propertyManagerChange.create({
    data: {
      propertyManagerId: manager.id,
      requesterName: manager.name,
      requesterEmail: manager.email,
      buildingId: project.buildingId,
      projectId,
      kind,
      newStartDate,
      reason,
    },
  });
  const what =
    kind === "CANCEL"
      ? `asked to cancel ${project.jobTitle} (${formatDay(project.projectDate)}).`
      : `asked to move ${project.jobTitle} from ${formatDay(project.projectDate)} to ${formatDay(newStartDate!)}.`;
  await emailStaff(
    `${kind === "CANCEL" ? "Cancel" : "New date"} requested: ${project.jobTitle}`,
    kind === "CANCEL" ? "Turnover cancel requested" : "Turnover new date requested",
    [`${manager.name} ${what}`, ...(reason ? [`Reason: ${reason}`] : []), "Nothing changes until someone applies it on the Requests tab."],
  );
  return { ok: true };
}

export async function withdrawChange(manager: LinkedManager, changeId: string): Promise<Result> {
  const change = await prisma.propertyManagerChange.findUnique({ where: { id: changeId } });
  if (!change || !(await managerBuildingIds(manager.id)).includes(change.buildingId)) return { error: "Change not found" };
  const updated = await prisma.propertyManagerChange.updateMany({
    where: { id: changeId, status: "OPEN" },
    data: { status: "WITHDRAWN", decidedBy: manager.email, decidedAt: new Date() },
  });
  if (!updated.count) return { error: "Sueep already answered this. Refresh to see it." };
  const project = await prisma.project.findUnique({ where: { id: change.projectId }, select: { jobTitle: true } });
  await emailStaff(`Change withdrawn: ${project?.jobTitle ?? "turnover"}`, "Turnover change withdrawn", [
    `${manager.name} took back their ${change.kind === "CANCEL" ? "cancel" : "new date"} request for ${project?.jobTitle ?? "a turnover"}. Nothing to do.`,
  ]);
  return { ok: true };
}

async function emailManagerAnswer(
  change: { propertyManagerId: string | null; requesterName: string; requesterEmail: string; projectId: string },
  subject: string,
  title: string,
  body: string,
  message: string | null,
  /** For a moved turnover: the new dates, sent as an updated calendar file */
  moved?: { building: string; unit: string; address: string | null; start: Date; end: Date | null },
) {
  try {
    const { url, contact } = await emailExtrasFor(change.propertyManagerId);
    await sendEmail({
      type: "PROPERTY_MANAGER_CHANGE_ANSWERED",
      to: change.requesterEmail,
      link: `/erp/projects/${change.projectId}`,
      subject,
      // No link in the file: the sign-in button shouldn't end up in a shared calendar.
      ...(moved ? { attachments: [turnoverCalendarAttachment({ projectId: change.projectId, ...moved, url: null })] } : {}),
      html: buildPropertyManagerChangeAnsweredEmail({
        firstName: firstName(change.requesterName),
        title,
        body,
        message,
        url,
        contact,
      }),
    });
  } catch (e) {
    console.error("Property manager change answer email failed:", e);
  }
}

/**
 * Staff apply a change. Blocked while the unit has crew booked from today
 * on, so crew are always moved or cancelled on the Schedule page, which
 * sends them the right notices.
 */
export async function applyChange(changeId: string, staffEmail: string, body: Record<string, unknown>): Promise<Result> {
  const change = await prisma.propertyManagerChange.findUnique({ where: { id: changeId } });
  if (!change || change.status !== "OPEN") return { error: "This change was already handled" };
  const project = await prisma.project.findUnique({
    where: { id: change.projectId },
    select: {
      id: true,
      jobTitle: true,
      status: true,
      projectDate: true,
      projectEndDate: true,
      turnoverRequestId: true,
      building: { select: { name: true, address: true } },
      turnoverRequest: { select: { unitNumber: true } },
    },
  });
  if (!project?.projectDate) return { error: "The unit's project is gone or has no date. Decline this change instead." };

  const today = new Date(`${todayEasternKey()}T00:00:00.000Z`);
  const [crewDays, workerDays] = await Promise.all([
    prisma.projectDayAssignment.count({ where: { projectId: project.id, date: { gte: today } } }),
    prisma.projectWorkerDayAssignment.count({ where: { projectId: project.id, date: { gte: today } } }),
  ]);
  if (crewDays + workerDays > 0) {
    return {
      error: `This unit has crew booked. ${change.kind === "CANCEL" ? "Remove" : "Move"} its days on the Schedule page first so the crew is told, then apply.`,
    };
  }

  const staffMessage = text(body.message, 2000);
  const claimed = await prisma.propertyManagerChange.updateMany({
    where: { id: changeId, status: "OPEN" },
    data: { status: "APPLIED", staffMessage, decidedBy: staffEmail, decidedAt: new Date() },
  });
  if (!claimed.count) return { error: "Someone already handled this change" };

  if (change.kind === "CANCEL") {
    await prisma.project.update({ where: { id: project.id }, data: { status: "ARCHIVED" } });
    await emailManagerAnswer(
      change,
      `Cancelled: ${project.jobTitle}`,
      "Turnover cancelled",
      `${project.jobTitle} on ${formatDay(project.projectDate)} is cancelled.`,
      staffMessage,
    );
    return { ok: true };
  }

  // Keep the turn the same length, just starting on the new day.
  const newStart = change.newStartDate!;
  const shift = newStart.getTime() - project.projectDate.getTime();
  const newEnd = project.projectEndDate ? new Date(project.projectEndDate.getTime() + shift) : null;
  await prisma.$transaction([
    prisma.project.update({ where: { id: project.id }, data: { projectDate: newStart, projectEndDate: newEnd } }),
    ...(project.turnoverRequestId
      ? [prisma.turnoverRequest.update({ where: { id: project.turnoverRequestId }, data: { startDate: newStart, endDate: newEnd } })]
      : []),
  ]);
  await emailManagerAnswer(
    change,
    `New date: ${project.jobTitle}, ${formatDay(newStart)}`,
    "Turnover moved",
    `${project.jobTitle} moved from ${formatDay(project.projectDate)} to ${formatDay(newStart)}. To update your calendar, open the attached file.`,
    staffMessage,
    {
      building: project.building?.name ?? project.jobTitle,
      unit: project.turnoverRequest?.unitNumber ? `#${project.turnoverRequest.unitNumber}` : "",
      address: project.building?.address ?? null,
      start: newStart,
      end: newEnd,
    },
  );
  return { ok: true };
}

export async function declineChange(changeId: string, staffEmail: string, body: Record<string, unknown>): Promise<Result> {
  const declineReason = text(body.reason, 500);
  if (!declineReason) return { error: "Give a reason. The property manager sees it." };
  const staffMessage = text(body.message, 2000);
  const change = await prisma.propertyManagerChange.findUnique({ where: { id: changeId } });
  if (!change) return { error: "Change not found" };
  const claimed = await prisma.propertyManagerChange.updateMany({
    where: { id: changeId, status: "OPEN" },
    data: { status: "DECLINED", declineReason, staffMessage, decidedBy: staffEmail, decidedAt: new Date() },
  });
  if (!claimed.count) return { error: "Someone already handled this change" };

  const project = await prisma.project.findUnique({ where: { id: change.projectId }, select: { jobTitle: true, projectDate: true } });
  const title = project?.jobTitle ?? "Your turnover";
  const when = project?.projectDate ? ` on ${formatDay(project.projectDate)}` : "";
  await emailManagerAnswer(
    change,
    `About your ${change.kind === "CANCEL" ? "cancel" : "new date"}: ${title}`,
    change.kind === "CANCEL" ? "We couldn't cancel this turnover" : "We couldn't move this turnover",
    `${title} stays as it is${when}. Reason: ${declineReason}`,
    staffMessage,
  );
  return { ok: true };
}
