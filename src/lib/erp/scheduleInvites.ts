import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { buildDayAssignmentInvite } from "@/lib/calendarInvite";
import { dayKey } from "@/lib/erp/schedule";
import { todayEasternKey } from "@/lib/erp/dates";
import { centsToDollars } from "@/lib/erp/money";
import { turnoverScopeDisplayLabel } from "@/lib/erp/turnoverScope";
import { cancelConfirmation, markInviteSent, parseInviteUid, prepareConfirmation, responseButtonsHtml, responseUrl } from "@/lib/erp/scheduleConfirmations";

/** Shared "you're on the schedule" notification path — used by both the
 * supervisor day-assignment routes and the crew (employee/contractor)
 * worker-assignment routes, so both actually carry the same specifics
 * (date, time, scope, address) instead of drifting apart, and both get
 * updated/cancelled the same way whenever the underlying assignment
 * changes. Every send swallows its own errors (logs and returns) — a
 * notification failure should never block the scheduling action itself,
 * same rule every call site already followed before this was centralized. */

export function extractEmailAddress(raw: string | undefined): string {
  if (!raw) return "noreply@sueep.com";
  const match = raw.match(/<([^>]+)>/);
  return match ? match[1]! : raw.trim();
}

function organizerEmail(): string {
  return extractEmailAddress(process.env.RESEND_FROM);
}

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
}

function dateKeyLabel(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00.000Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatTimeLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/** Human "when" line for a single day, e.g. "Tuesday, August 18, 2026,
 * 8:00 AM – 4:00 PM" or "Tuesday, August 18, 2026 (all day)". */
export function formatInviteWhen(dateKey: string, startTime?: string | null, endTime?: string | null): string {
  const day = dateKeyLabel(dateKey);
  if (startTime && endTime) return `${day}, ${formatTimeLabel(startTime)} – ${formatTimeLabel(endTime)}`;
  return `${day} (all day)`;
}

/** Joins SOV item descriptions and/or turnover scope labels into one
 * display string, e.g. "Patch drywall, Trim paint" or "Paint". Null when
 * there's nothing to show, so callers can skip the "Scope:" line entirely. */
export function scopeText(sovDescriptions: string[], scopeLabels: string[]): string | null {
  const parts = [...sovDescriptions, ...scopeLabels];
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Looks up an Employee or Contractor's email/display name — the one thing
 * that gates whether a crew invite can be sent at all. Returns null (no
 * email on file, or neither id given) rather than throwing, callers just
 * skip sending in that case. */
export async function resolveWorkerContact(
  employeeId: string | null,
  contractorId: string | null
): Promise<{ email: string; name: string } | null> {
  if (employeeId) {
    const e = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { email: true, firstName: true, lastName: true },
    });
    if (!e?.email) return null;
    return { email: e.email, name: `${e.firstName} ${e.lastName}`.trim() };
  }
  if (contractorId) {
    const c = await prisma.contractor.findUnique({ where: { id: contractorId }, select: { email: true, name: true } });
    if (!c?.email) return null;
    return { email: c.email, name: c.name };
  }
  return null;
}

/** Running: a sub covering the day in the supervisor's spot (no Sueep supervisor on site). */
type InviteRole = "Supervising" | "Working" | "Running";

function inviteHtml(params: {
  role: InviteRole;
  title: string;
  when: string;
  scopeText?: string | null;
  location?: string;
  cancelled?: boolean;
  /** Extra HTML paragraph(s) inserted right after the main sentence — e.g.
   * the turnover crew-hours-budget note, supervisor-only. */
  extraHtml?: string;
  /** Confirm / Can't make it page (scheduleConfirmations.ts) */
  respondUrl?: string | null;
  /** The day's note and the property manager's request notes (inviteNotes) */
  notes?: string | null;
}): string {
  const verb = params.role === "Supervising" ? "assigned to supervise" : params.role === "Running" ? "assigned to run" : "scheduled to work on";
  const title = escapeHtml(params.title);
  const lines = [
    params.cancelled
      ? `<p>Your assignment to <strong>${title}</strong> on ${params.when} has been removed.</p>`
      : `<p>You've been ${verb} <strong>${title}</strong>, ${params.when}.</p>`,
    params.extraHtml ?? "",
    params.scopeText ? `<p><strong>Scope:</strong> ${escapeHtml(params.scopeText)}</p>` : "",
    params.location ? `<p><strong>Address:</strong> ${escapeHtml(params.location)}</p>` : "",
    !params.cancelled && params.notes ? `<p><strong>Notes:</strong><br>${escapeHtml(params.notes).replace(/\n/g, "<br>")}</p>` : "",
    !params.cancelled && params.respondUrl ? responseButtonsHtml(params.respondUrl) : "",
    !params.cancelled ? `<p>Add the attached invite to your calendar.</p>` : "",
  ];
  return lines.filter(Boolean).join("");
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** What the person actually sees in the invite. A re-send with the same
 * fingerprint is skipped; the supervisor-only hours note (extraHtml) and the
 * link are left out on purpose, since they change without the day changing. */
function inviteFingerprint(p: { to: string; role: InviteRole; title: string; dateKey: string; startTime?: string | null; endTime?: string | null; location?: string; scopeText?: string | null }) {
  return createHash("sha256")
    .update(JSON.stringify([p.to.toLowerCase(), p.role, p.title, p.dateKey, p.startTime ?? "", p.endTime ?? "", p.location ?? "", p.scopeText ?? ""]))
    .digest("hex");
}

/**
 * What everyone on a day should read: the day's note (where a portal
 * request's "Requested by ... : comments" lands) and, for a turnover unit,
 * the property manager's notes from their request. Null when there are none.
 */
async function inviteNotes(uid: string, dateKey: string): Promise<string | null> {
  const parsed = parseInviteUid(uid);
  if (!parsed) return null;
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  let projectId: string | null = null;
  let dayNote: string | null = null;
  if (parsed.kind === "day" || parsed.kind === "day-sub") {
    const a = await prisma.projectDayAssignment.findUnique({ where: { id: parsed.assignmentId }, select: { projectId: true, comment: true } });
    projectId = a?.projectId ?? null;
    dayNote = a?.comment ?? null;
  } else if (parsed.kind === "worker") {
    const w = await prisma.projectWorkerDayAssignment.findUnique({ where: { id: parsed.assignmentId }, select: { projectId: true } });
    projectId = w?.projectId ?? null;
    if (projectId) {
      const a = await prisma.projectDayAssignment.findUnique({ where: { projectId_date: { projectId, date } }, select: { comment: true } });
      dayNote = a?.comment ?? null;
    }
  } else if (parsed.kind === "co-day" || parsed.kind === "co-day-sub") {
    const a = await prisma.changeOrderDayAssignment.findUnique({ where: { id: parsed.assignmentId }, select: { comment: true } });
    dayNote = a?.comment ?? null;
  } else {
    const w = await prisma.changeOrderWorkerDayAssignment.findUnique({ where: { id: parsed.assignmentId }, select: { changeOrderId: true } });
    if (w) {
      const a = await prisma.changeOrderDayAssignment.findUnique({ where: { changeOrderId_date: { changeOrderId: w.changeOrderId, date } }, select: { comment: true } });
      dayNote = a?.comment ?? null;
    }
  }
  const request = projectId
    ? await prisma.propertyManagerRequest.findFirst({ where: { projectId, notes: { not: null } }, select: { notes: true } })
    : null;
  const parts = [dayNote?.trim(), request?.notes?.trim() ? `From the property manager: ${request.notes.trim()}` : null].filter(Boolean);
  return parts.length ? parts.join("\n") : null;
}

/** Sends (or cancels) the invite for one specific day. `uid` should be
 * stable across re-sends for the same assignment (reuse the row's id) so
 * calendar apps update/remove the existing event instead of duplicating
 * it — same convention every call site already used before this helper
 * existed.
 *
 * Many schedule edits re-run this for everyone on a day. It only emails
 * when something the person sees changed since the last invite for this
 * uid (date, times, title, address, scope), and only sends a cancellation
 * to someone who actually got an invite. */
export async function sendDayInvite(params: {
  uid: string;
  to: string;
  attendeeName?: string;
  role: InviteRole;
  title: string;
  dateKey: string;
  startTime?: string | null;
  endTime?: string | null;
  location?: string;
  scopeText?: string | null;
  url?: string;
  cancelled?: boolean;
  extraHtml?: string;
}): Promise<void> {
  // Never notify for a day that's already passed — a schedule change on a
  // date behind "today" (adding/moving/cancelling someone on a past chip,
  // e.g. editing a completed job's history) has nobody left to actually
  // notify about it. Applies to cancellations too, not just new invites.
  if (params.dateKey < todayEasternKey()) return;
  const when = formatInviteWhen(params.dateKey, params.startTime, params.endTime);
  const baseFingerprint = inviteFingerprint(params);
  try {
    const notes = params.cancelled ? null : await inviteNotes(params.uid, params.dateKey).catch(() => null);
    // A changed note re-sends the invite but isn't a changed day: answers stay. Kept off
    // the fingerprint when there's no note, so invites sent before notes existed match.
    const fingerprint = notes ? `${baseFingerprint}|${createHash("sha256").update(notes).digest("hex").slice(0, 16)}` : baseFingerprint;
    const last = await prisma.scheduleInviteSent.findUnique({ where: { uid: params.uid } });
    if (params.cancelled ? !last || last.cancelled : last && !last.cancelled && last.fingerprint === fingerprint) return;
    const dayChanged = !!last && !last.cancelled && last.fingerprint.split("|")[0] !== baseFingerprint;

    // Confirm / Can't make it: a response link per invite. A changed day asks again.
    let respondUrl: string | null = null;
    if (!params.cancelled) {
      const path = params.url ? new URL(params.url, "https://x").pathname : undefined;
      const token = await prepareConfirmation({
        uid: params.uid,
        to: params.to,
        name: params.attendeeName,
        title: params.title,
        dateKey: params.dateKey,
        link: path,
        changed: dayChanged,
      }).catch((e) => {
        console.error("Schedule confirmation link failed", { uid: params.uid }, e);
        return null;
      });
      respondUrl = token ? responseUrl(token) : null;
    }

    const ics = buildDayAssignmentInvite({
      uid: params.uid,
      dateKey: params.dateKey,
      startTime: params.startTime,
      endTime: params.endTime,
      summary: `${params.role}: ${params.title}`,
      description: [params.title, params.scopeText ? `Scope: ${params.scopeText}` : "", notes ? `Notes: ${notes}` : "", params.url ?? ""]
        .filter(Boolean)
        .join("\n"),
      location: params.location,
      url: params.url,
      organizerEmail: organizerEmail(),
      organizerName: "Sueep Schedule",
      attendeeEmail: params.to,
      attendeeName: params.attendeeName,
      cancelled: params.cancelled,
    });
    const result = await sendEmail({
      type: "SCHEDULE_INVITE",
      link: params.url ? new URL(params.url, "https://x").pathname : undefined,
      to: params.to,
      subject: `${params.cancelled ? "Cancelled" : "You're scheduled"}: ${params.title}, ${when}`,
      html: inviteHtml({ ...params, when, respondUrl, notes }),
      attachments: [{ filename: "invite.ics", content: Buffer.from(ics) }],
    });
    // Only remember invites that really went out, so turning email back on
    // (or a test copy with email not set up) doesn't swallow the next one.
    if (params.cancelled) await cancelConfirmation(params.uid).catch(() => {});
    if (result !== "SENT") return;
    if (!params.cancelled) await markInviteSent(params.uid).catch(() => {});
    const cancelled = !!params.cancelled;
    await prisma.scheduleInviteSent.upsert({
      where: { uid: params.uid },
      update: { fingerprint, cancelled, sentAt: new Date() },
      create: { uid: params.uid, fingerprint, cancelled },
    });
  } catch (e) {
    console.error("Failed to send schedule invite", { uid: params.uid, cancelled: params.cancelled }, e);
  }
}

/**
 * Refreshes every already-scheduled crew member's invite for a project
 * across the given dates — used whenever the *day-assignment* itself
 * changes (time, scope/SOV picks, or it's being removed/cancelled) so
 * crew who were never touched directly still get an up-to-date invite
 * instead of one that's silently gone stale. Each worker's own SOV item /
 * turnover scope split (see ProjectWorkerDayAssignment.assignedSovItemId/
 * assignedScopeItem) wins when set; otherwise falls back to the day's
 * overall scope. A no-op if nobody's actually scheduled on those dates.
 */
export async function notifyProjectCrew(params: {
  projectId: string;
  dates: Date[];
  projectTitle: string;
  location?: string;
  startTime: string | null;
  endTime: string | null;
  daySovDescriptions: string[];
  dayScopeLabels: string[];
  url?: string;
  cancelled?: boolean;
}): Promise<void> {
  const rows = await prisma.projectWorkerDayAssignment.findMany({
    where: { projectId: params.projectId, date: { in: params.dates } },
    select: {
      id: true,
      date: true,
      employeeId: true,
      contractorId: true,
      assignedSovItemId: true,
      assignedScopeItem: true,
    },
  });
  if (rows.length === 0) return;

  const otherDescription = (
    await prisma.turnoverRequest.findFirst({
      where: { projects: { some: { id: params.projectId } } },
      select: { otherDescription: true },
    })
  )?.otherDescription;

  const sovIds = [...new Set(rows.map((r) => r.assignedSovItemId).filter((v): v is string => !!v))];
  const sovDescById = new Map(
    sovIds.length > 0
      ? (await prisma.projectSOVItem.findMany({ where: { id: { in: sovIds } }, select: { id: true, description: true } })).map(
          (s) => [s.id, s.description] as const
        )
      : []
  );
  const dayScope = scopeText(params.daySovDescriptions, params.dayScopeLabels);

  await Promise.all(
    rows.map(async (r) => {
      const contact = await resolveWorkerContact(r.employeeId, r.contractorId);
      if (!contact) return;
      const ownScope = r.assignedSovItemId
        ? sovDescById.get(r.assignedSovItemId) ?? null
        : r.assignedScopeItem
        ? turnoverScopeDisplayLabel(r.assignedScopeItem, otherDescription)
        : null;
      await sendDayInvite({
        uid: `worker-assignment-${r.id}@sueep.com`,
        to: contact.email,
        attendeeName: contact.name,
        role: "Working",
        title: params.projectTitle,
        dateKey: dayKey(r.date),
        startTime: params.startTime,
        endTime: params.endTime,
        location: params.location,
        scopeText: ownScope ?? dayScope,
        url: params.url,
        cancelled: params.cancelled,
      });
    })
  );
}

/** Same idea as notifyProjectCrew, for a change order's crew — no SOV/
 * scope splitting there (ChangeOrderWorkerDayAssignment has no scope
 * fields), so just title/date/time/address. */
export async function notifyChangeOrderCrew(params: {
  changeOrderId: string;
  dates: Date[];
  title: string;
  location?: string;
  startTime: string | null;
  endTime: string | null;
  url?: string;
  cancelled?: boolean;
}): Promise<void> {
  const rows = await prisma.changeOrderWorkerDayAssignment.findMany({
    where: { changeOrderId: params.changeOrderId, date: { in: params.dates } },
    select: { id: true, date: true, employeeId: true, contractorId: true },
  });
  if (rows.length === 0) return;

  await Promise.all(
    rows.map(async (r) => {
      const contact = await resolveWorkerContact(r.employeeId, r.contractorId);
      if (!contact) return;
      await sendDayInvite({
        uid: `co-worker-assignment-${r.id}@sueep.com`,
        to: contact.email,
        attendeeName: contact.name,
        role: "Working",
        title: params.title,
        dateKey: dayKey(r.date),
        startTime: params.startTime,
        endTime: params.endTime,
        location: params.location,
        url: params.url,
        cancelled: params.cancelled,
      });
    })
  );
}

/**
 * Invite (or cancellation) for a sub running a day in the supervisor's spot,
 * on a project day ("day") or a change order day ("co-day"). The uid includes
 * the contractor, so a different sub on the same day gets their own invite
 * and the one replaced can be sent a cancellation. Skipped when the sub has
 * no email on file. Same rules as every other invite (sendDayInvite).
 */
/** A sub's estimated pay on a janitorial turnover: half the contract value. Only the dollar amount is shown, never how it's worked out. */
const TURNOVER_SUB_PAY_SHARE = 0.5;

async function turnoverSubPayHtml(projectId: string | null | undefined): Promise<string | undefined> {
  if (!projectId) return undefined;
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { segment: true, contractValueCents: true } });
  if (p?.segment !== "JANITORIAL_TURNOVER_REQUESTS" || !p.contractValueCents) return undefined;
  return `<p><strong>Estimated pay:</strong> ${centsToDollars(Math.round(p.contractValueCents * TURNOVER_SUB_PAY_SHARE))}</p>`;
}

export async function sendSubLeadInvite(params: {
  kind: "day" | "co-day";
  assignmentId: string;
  contractorId: string;
  title: string;
  dateKey: string;
  startTime?: string | null;
  endTime?: string | null;
  location?: string;
  scopeText?: string | null;
  url?: string;
  cancelled?: boolean;
}): Promise<void> {
  const contact = await resolveWorkerContact(null, params.contractorId);
  if (!contact) return;
  const extraHtml =
    params.kind === "day" && !params.cancelled
      ? await prisma.projectDayAssignment
          .findUnique({ where: { id: params.assignmentId }, select: { projectId: true } })
          .then((a) => turnoverSubPayHtml(a?.projectId))
          .catch(() => undefined)
      : undefined;
  await sendDayInvite({
    uid: `${params.kind}-assignment-${params.assignmentId}-sub-${params.contractorId}@sueep.com`,
    to: contact.email,
    attendeeName: contact.name,
    role: "Running",
    title: params.title,
    dateKey: params.dateKey,
    startTime: params.startTime,
    endTime: params.endTime,
    location: params.location,
    scopeText: params.scopeText,
    url: params.url,
    cancelled: params.cancelled,
    extraHtml,
  });
}

function dayLabel(d: Date | null | undefined): string | null {
  return d ? d.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;
}
