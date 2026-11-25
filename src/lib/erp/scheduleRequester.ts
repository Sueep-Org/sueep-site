/**
 * Tells the client who asked for a scheduled day (their project manager,
 * usually through the project portal) once everyone invited for that day
 * has clicked Confirm.
 *
 * - Project days: the requester is saved on the day (requesterName/Email),
 *   filled in by the portal and editable on the schedule's day card. A
 *   turnover made from a property manager's request falls back to that
 *   property manager, with the notes from their request.
 * - Change order days: the change order's own requester, when it has an
 *   email (portal change orders are saved as "Name <email>").
 * - "Everyone" is every invite that went out for that day: the supervisor
 *   running it plus the crew. One email per date; moving the day to a new
 *   date and confirming again tells them again.
 * - A day we give to a sub is confirmed the moment the sub is put on it, no
 *   waiting on clicks. That email never names the sub or the crew size.
 * - The email repeats the notes they wrote when they asked.
 * - Declines never reach the client, only staff (see scheduleConfirmations).
 */
import { prisma } from "@/lib/prisma";
import { escapeHtml, sendEmail } from "@/lib/email";
import { todayEasternKey } from "./dates";
import { dayCellLabel } from "./schedule";
import { formatInviteWhen } from "./scheduleInvites";
import { turnoverScopeDisplayLabel } from "./turnoverScope";

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** "Name <email>" or a bare email; null when there's no usable email. */
export function parseRequester(raw: string | null | undefined): { name: string; email: string } | null {
  const s = raw?.trim();
  if (!s) return null;
  const m = s.match(/^(.*?)\s*<([^>]+)>$/);
  const email = (m ? m[2]! : s).trim();
  if (!EMAIL_RE.test(email)) return null;
  return { name: (m ? m[1]!.trim() : "") || email, email };
}

/** Cleans requester fields from a request body. Undefined when the body didn't send them (leave as is). */
export function requesterFromBody(body: Record<string, unknown>): { requesterName: string | null; requesterEmail: string | null } | undefined {
  if (!("requesterEmail" in body)) return undefined;
  const email = typeof body.requesterEmail === "string" ? body.requesterEmail.trim().slice(0, 254) : "";
  if (!email || !EMAIL_RE.test(email)) return { requesterName: null, requesterEmail: null };
  const name = typeof body.requesterName === "string" ? body.requesterName.trim().slice(0, 200) : "";
  return { requesterName: name || null, requesterEmail: email };
}

const keyOf = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The notes the requester typed on the portal, from the day's comment. The
 * portal saves them as "Requested by <name> via project portal: <notes>";
 * the latest such line wins.
 */
export function requesterNotesFromComment(comment: string | null | undefined): string | null {
  const lines = (comment ?? "").split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i]!.match(/^Requested by .*? via project portal: ([\s\S]+)$/);
    if (m) return m[1]!.trim() || null;
  }
  return null;
}

/** True when at least one invite went out for these assignments and every one of them is Confirmed. */
async function everyoneConfirmed(assignmentIds: string[]): Promise<{ ok: boolean; people: number }> {
  const rows = await prisma.scheduleConfirmation.findMany({
    where: { assignmentId: { in: assignmentIds }, status: { not: "CANCELLED" }, inviteSentAt: { not: null } },
    select: { status: true },
  });
  return { ok: rows.length > 0 && rows.every((r) => r.status === "CONFIRMED"), people: rows.length };
}

async function sendConfirmedEmail(p: {
  to: { name: string; email: string };
  title: string;
  dateKey: string;
  startTime: string | null;
  endTime: string | null;
  work: string[];
  address: string | null;
  /** How many confirmed; null leaves the crew line out (sub days) */
  people: number | null;
  notes: string | null;
  link: string;
}) {
  const first = p.to.name.includes("@") ? "" : p.to.name.split(/\s+/)[0]!;
  const when = formatInviteWhen(p.dateKey, p.startTime, p.endTime);
  const rows = [
    `<li><strong>When:</strong> ${escapeHtml(when)}</li>`,
    p.work.length ? `<li><strong>Work:</strong> ${p.work.map(escapeHtml).join(", ")}</li>` : "",
    p.address ? `<li><strong>Address:</strong> ${escapeHtml(p.address)}</li>` : "",
    p.people != null ? `<li><strong>Crew:</strong> ${p.people} ${p.people === 1 ? "person" : "people"} confirmed</li>` : "",
  ].join("");
  const notes = p.notes?.trim()
    ? `<p><strong>Your notes:</strong></p><blockquote style="margin:0 0 16px;padding:8px 12px;border-left:3px solid #E73C6E;background:#fdf2f6;white-space:pre-wrap">${escapeHtml(p.notes.trim())}</blockquote>`
    : "";
  await sendEmail({
    type: "SCHEDULE_REQUESTER_CONFIRMED",
    to: p.to.email,
    subject: `Confirmed: ${p.title}, ${dayCellLabel(p.dateKey)}`,
    html: `<p>Hi${first ? ` ${escapeHtml(first)}` : ""},</p><p>The day you asked for is confirmed. Our crew will be at <strong>${escapeHtml(p.title)}</strong> on <strong>${escapeHtml(dayCellLabel(p.dateKey))}</strong>.</p><ul>${rows}</ul>${notes}<p>Questions or changes? Just reply to this email.</p>`,
    replyTo: (process.env.CONTACT_TO_EMAIL ?? "contact@sueep.com").trim(),
    link: p.link,
  });
}

/** Project day: emails its requester when everyone on it has confirmed (once per date). */
export async function notifyProjectDayRequester(dayId: string): Promise<boolean> {
  const day = await prisma.projectDayAssignment.findUnique({
    where: { id: dayId },
    select: {
      id: true, projectId: true, date: true, startTime: true, endTime: true, scopeItems: true, comment: true, supervisorContractorId: true,
      requesterName: true, requesterEmail: true, requesterNotifiedFor: true,
      sovItems: { select: { description: true } },
      changeOrders: { select: { title: true } },
      project: {
        select: {
          jobTitle: true,
          building: { select: { address: true } },
          workOrderRecord: { select: { siteAddress: true } },
          turnoverRequest: { select: { otherDescription: true } },
        },
      },
    },
  });
  if (!day) return false;
  let to: { name: string; email: string } | null = day.requesterEmail ? { name: day.requesterName || day.requesterEmail, email: day.requesterEmail } : null;
  let notes = to ? requesterNotesFromComment(day.comment) : null;
  if (!to) {
    const pmRequest = await prisma.propertyManagerRequest.findFirst({
      where: { projectId: day.projectId, status: "CONFIRMED" },
      orderBy: { createdAt: "desc" },
      select: { requesterName: true, requesterEmail: true, notes: true },
    });
    if (!pmRequest?.requesterEmail) return false;
    to = { name: pmRequest.requesterName || pmRequest.requesterEmail, email: pmRequest.requesterEmail };
    notes = pmRequest.notes;
  }
  const dateKey = keyOf(day.date);
  if (day.requesterNotifiedFor === dateKey || dateKey < todayEasternKey()) return false;
  // A sub on the day confirms it; otherwise wait for everyone to click Confirm
  let people: number | null = null;
  if (!day.supervisorContractorId) {
    const workers = await prisma.projectWorkerDayAssignment.findMany({ where: { projectId: day.projectId, date: day.date }, select: { id: true } });
    const check = await everyoneConfirmed([day.id, ...workers.map((w) => w.id)]);
    if (!check.ok) return false;
    people = check.people;
  }
  // Claim first so two confirms at the same moment send one email
  const claimed = await prisma.projectDayAssignment.updateMany({
    where: { id: day.id, OR: [{ requesterNotifiedFor: null }, { requesterNotifiedFor: { not: dateKey } }] },
    data: { requesterNotifiedFor: dateKey },
  });
  if (!claimed.count) return false;
  try {
    await sendConfirmedEmail({
      to,
      title: day.project.jobTitle,
      dateKey,
      startTime: day.startTime,
      endTime: day.endTime,
      work: [
        ...day.sovItems.map((s) => s.description),
        ...day.scopeItems.map((v) => turnoverScopeDisplayLabel(v, day.project.turnoverRequest?.otherDescription)),
        ...day.changeOrders.map((c) => c.title),
      ],
      address: day.project.building?.address || day.project.workOrderRecord?.siteAddress || null,
      people,
      notes,
      link: `/erp/projects/${day.projectId}`,
    });
    return true;
  } catch (e) {
    await prisma.projectDayAssignment.update({ where: { id: day.id }, data: { requesterNotifiedFor: day.requesterNotifiedFor } });
    throw e;
  }
}

/** Change order day: emails the change order's requester when everyone on it has confirmed (once per date). */
export async function notifyCoDayRequester(coDayId: string): Promise<boolean> {
  const day = await prisma.changeOrderDayAssignment.findUnique({
    where: { id: coDayId },
    select: {
      id: true, changeOrderId: true, date: true, startTime: true, endTime: true, requesterNotifiedFor: true, supervisorContractorId: true,
      changeOrder: {
        select: {
          title: true, description: true, requestedBy: true, projectId: true,
          project: { select: { jobTitle: true, building: { select: { address: true } }, workOrderRecord: { select: { siteAddress: true } } } },
        },
      },
    },
  });
  const to = parseRequester(day?.changeOrder.requestedBy);
  if (!day || !to) return false;
  const dateKey = keyOf(day.date);
  if (day.requesterNotifiedFor === dateKey || dateKey < todayEasternKey()) return false;
  let people: number | null = null;
  if (!day.supervisorContractorId) {
    const workers = await prisma.changeOrderWorkerDayAssignment.findMany({ where: { changeOrderId: day.changeOrderId, date: day.date }, select: { id: true } });
    const check = await everyoneConfirmed([day.id, ...workers.map((w) => w.id)]);
    if (!check.ok) return false;
    people = check.people;
  }
  const claimed = await prisma.changeOrderDayAssignment.updateMany({
    where: { id: day.id, OR: [{ requesterNotifiedFor: null }, { requesterNotifiedFor: { not: dateKey } }] },
    data: { requesterNotifiedFor: dateKey },
  });
  if (!claimed.count) return false;
  const p = day.changeOrder.project;
  try {
    await sendConfirmedEmail({
      to,
      title: p.jobTitle,
      dateKey,
      startTime: day.startTime,
      endTime: day.endTime,
      work: [day.changeOrder.title],
      address: p.building?.address || p.workOrderRecord?.siteAddress || null,
      people,
      notes: day.changeOrder.description,
      link: `/erp/projects/${day.changeOrder.projectId}/change-orders/${day.changeOrderId}`,
    });
    return true;
  } catch (e) {
    await prisma.changeOrderDayAssignment.update({ where: { id: day.id }, data: { requesterNotifiedFor: day.requesterNotifiedFor } });
    throw e;
  }
}

/** After someone confirms: finds the day their invite was for and checks it. Never throws. */
export async function notifyRequesterAfterConfirm(c: { kind: string; assignmentId: string }): Promise<void> {
  try {
    if (c.kind === "day" || c.kind === "day-sub") {
      await notifyProjectDayRequester(c.assignmentId);
    } else if (c.kind === "worker") {
      const w = await prisma.projectWorkerDayAssignment.findUnique({ where: { id: c.assignmentId }, select: { projectId: true, date: true } });
      const day = w && (await prisma.projectDayAssignment.findUnique({ where: { projectId_date: { projectId: w.projectId, date: w.date } }, select: { id: true } }));
      if (day) await notifyProjectDayRequester(day.id);
    } else if (c.kind === "co-day" || c.kind === "co-day-sub") {
      await notifyCoDayRequester(c.assignmentId);
    } else if (c.kind === "co-worker") {
      const w = await prisma.changeOrderWorkerDayAssignment.findUnique({ where: { id: c.assignmentId }, select: { changeOrderId: true, date: true } });
      const day = w && (await prisma.changeOrderDayAssignment.findUnique({ where: { changeOrderId_date: { changeOrderId: w.changeOrderId, date: w.date } }, select: { id: true } }));
      if (day) await notifyCoDayRequester(day.id);
    }
  } catch (e) {
    console.error("Requester confirmed email failed", { kind: c.kind, assignmentId: c.assignmentId }, e);
  }
}
