import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { buildDayAssignmentInvite, buildScheduleSeriesInvite } from "@/lib/calendarInvite";
import { dayKey } from "@/lib/erp/schedule";
import { turnoverScopeLabel } from "@/lib/erp/turnoverScope";
import { SHIFT_RESPONSE_ENABLED } from "@/lib/erp/shiftResponses";

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

/** Public-facing site base URL — the audience for a shift's accept/decline
 * link is the crew member/supervisor's own inbox, not the ERP, so this
 * deliberately reuses the same env var (and fallback) the employee-info/
 * contractor-info magic links already build their URLs from, not appUrl()
 * above (that one's for the "view project" ERP deep link in the same email,
 * a different audience). */
function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") || "https://sueep.com";
}

/** The two links a "you're scheduled" invite's Accept/Decline buttons point
 * to — same token, `action` just pre-selects which single confirm button
 * the landing page shows first (see /shift-response/[token]). */
export function shiftResponseLinks(token: string): { acceptUrl: string; declineUrl: string } {
  const base = `${siteUrl()}/shift-response/${token}`;
  return { acceptUrl: `${base}?action=accept`, declineUrl: `${base}?action=decline` };
}

/** Stable UID for a crew member's *series* invite (a worker added onto a
 * project's multi-day/repeat range) — keyed by series + which one of
 * employeeId/contractorId they are, not by any one row's id, since the
 * series spans several ProjectWorkerDayAssignment rows. Shared between
 * worker-assignments' POST (send) and the series DELETE route (cancel) so
 * both agree on the same event. */
export function workerSeriesUid(seriesId: string, employeeId: string | null, contractorId: string | null): string {
  return `worker-assignment-series-${seriesId}-${employeeId ?? `c-${contractorId}`}@sueep.com`;
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

/** Same idea as formatInviteWhen, for a repeating series' overall range. */
export function formatInviteRange(
  firstDateKey: string,
  lastDateKey: string,
  startTime?: string | null,
  endTime?: string | null
): string {
  const time = startTime && endTime ? `, ${formatTimeLabel(startTime)} – ${formatTimeLabel(endTime)}` : "";
  return `${dateKeyLabel(firstDateKey)} through ${dateKeyLabel(lastDateKey)}${time}`;
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

type InviteRole = "Supervising" | "Working";

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
  /** Present only for a non-cancelled send where the underlying assignment
   * row has a responseToken — renders the "I'll be there" / "Can't make it"
   * buttons. Never shown on a cancellation email (nothing to respond to
   * once the shift's been pulled). */
  responseToken?: string | null;
}): string {
  const verb = params.role === "Supervising" ? "assigned to supervise" : "scheduled to work on";
  const responseButtons =
    SHIFT_RESPONSE_ENABLED && !params.cancelled && params.responseToken
      ? (() => {
          const { acceptUrl, declineUrl } = shiftResponseLinks(params.responseToken);
          return `<p style="margin:20px 0">
  <a href="${acceptUrl}" style="background:#E73C6E;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;margin-right:10px;display:inline-block">I'll be there</a>
  <a href="${declineUrl}" style="background:#fff;color:#374151;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;border:1px solid #d1d5db;display:inline-block">Can't make it</a>
</p>`;
        })()
      : "";
  const lines = [
    params.cancelled
      ? `<p>Your assignment to <strong>${params.title}</strong> on ${params.when} has been removed.</p>`
      : `<p>You've been ${verb} <strong>${params.title}</strong>, ${params.when}.</p>`,
    params.extraHtml ?? "",
    params.scopeText ? `<p><strong>Scope:</strong> ${params.scopeText}</p>` : "",
    params.location ? `<p><strong>Address:</strong> ${params.location}</p>` : "",
    responseButtons,
    !params.cancelled ? `<p>Add the attached invite to your calendar.</p>` : "",
  ];
  return lines.filter(Boolean).join("");
}

/** Sends (or cancels) the invite for one specific day. `uid` should be
 * stable across re-sends for the same assignment (reuse the row's id) so
 * calendar apps update/remove the existing event instead of duplicating
 * it — same convention every call site already used before this helper
 * existed. */
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
  /** See inviteHtml's responseToken param — renders Accept/Decline buttons
   * when set on a non-cancelled send. */
  responseToken?: string | null;
}): Promise<void> {
  const when = formatInviteWhen(params.dateKey, params.startTime, params.endTime);
  try {
    const ics = buildDayAssignmentInvite({
      uid: params.uid,
      dateKey: params.dateKey,
      startTime: params.startTime,
      endTime: params.endTime,
      summary: `${params.role}: ${params.title}`,
      description: [params.title, params.scopeText ? `Scope: ${params.scopeText}` : "", params.url ?? ""]
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
    await sendEmail({
      to: params.to,
      subject: `${params.cancelled ? "Cancelled" : "You're scheduled"}: ${params.title}, ${when}`,
      html: inviteHtml({ ...params, when }),
      attachments: [{ filename: "invite.ics", content: Buffer.from(ics) }],
    });
  } catch (e) {
    console.error("Failed to send schedule invite", { uid: params.uid, cancelled: params.cancelled }, e);
  }
}

/** Same idea as sendDayInvite, for a recurring/multi-day series — one
 * combined recurring calendar event rather than one email per day. */
export async function sendSeriesInvite(params: {
  uid: string;
  to: string;
  attendeeName?: string;
  role: InviteRole;
  title: string;
  firstDateKey: string;
  lastDateKey: string;
  repeatDays: number[];
  startTime?: string | null;
  endTime?: string | null;
  location?: string;
  scopeText?: string | null;
  url?: string;
  cancelled?: boolean;
  extraHtml?: string;
}): Promise<void> {
  const when = formatInviteRange(params.firstDateKey, params.lastDateKey, params.startTime, params.endTime);
  try {
    const ics = buildScheduleSeriesInvite({
      uid: params.uid,
      firstDateKey: params.firstDateKey,
      lastDateKey: params.lastDateKey,
      repeatDays: params.repeatDays,
      startTime: params.startTime,
      endTime: params.endTime,
      summary: `${params.role}: ${params.title}`,
      description: [params.title, params.scopeText ? `Scope: ${params.scopeText}` : "", params.url ?? ""]
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
    await sendEmail({
      to: params.to,
      subject: `${params.cancelled ? "Cancelled" : "You're scheduled"}: ${params.title}, ${when}`,
      html: inviteHtml({ ...params, when }),
      attachments: [{ filename: "invite.ics", content: Buffer.from(ics) }],
    });
  } catch (e) {
    console.error("Failed to send schedule series invite", { uid: params.uid, cancelled: params.cancelled }, e);
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
      responseToken: true,
    },
  });
  if (rows.length === 0) return;

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
        ? turnoverScopeLabel(r.assignedScopeItem)
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
        responseToken: r.responseToken,
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
