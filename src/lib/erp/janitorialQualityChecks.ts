/**
 * Janitorial quality checks: site visits where an Admin or Project Manager
 * checks a building's key areas, talks with the property manager, and gives
 * the team updates. Scheduled one at a time on the contract's Quality tab
 * and shown on the Management calendar. Server only.
 */

import { prisma } from "@/lib/prisma";
import { buildQualityCheckEmail, buildQualityCheckSummaryEmail, buildQualityTeamNoticeEmail, sendEmail } from "@/lib/email";
import { addDaysKey } from "./managementCalendar";
import { todayEasternKey, utcDateKey } from "./dates";
import { needsAttention, parseAreaResults } from "./janitorialQualityShared";

/** Roles that can be picked to do a check. */
export const QUALITY_CHECKER_ROLES = ["ADMIN", "PROJECT_MANAGER"];

export type Checker = { id: string; email: string; name: string };

/** Admins and PMs, named from their employee profile when there is one. */
export async function loadCheckers(): Promise<Checker[]> {
  const users = await prisma.erpUser.findMany({
    where: { role: { in: QUALITY_CHECKER_ROLES } },
    select: { id: true, email: true },
  });
  const names = await namesByEmail(users.map((u) => u.email));
  return users
    .map((u) => ({ id: u.id, email: u.email, name: names.get(u.email.toLowerCase()) ?? u.email.split("@")[0]! }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function namesByEmail(emails: string[]): Promise<Map<string, string>> {
  if (!emails.length) return new Map();
  const employees = await prisma.employee.findMany({
    where: { email: { in: emails, mode: "insensitive" } },
    select: { email: true, firstName: true, lastName: true },
  });
  return new Map(employees.map((e) => [e.email!.toLowerCase(), `${e.firstName} ${e.lastName}`.trim()]));
}

export function checkerName(user: { email: string } | null, names: Map<string, string>): string {
  if (!user) return "Nobody assigned";
  return names.get(user.email.toLowerCase()) ?? user.email.split("@")[0]!;
}

const formatDay = (d: Date) =>
  d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL?.trim() || "").replace(/\/$/, "");

const CHECK_SELECT = {
  id: true,
  scheduledDate: true,
  notes: true,
  recurringContractId: true,
  assignedUser: { select: { email: true } },
  recurringContract: { select: { building: { select: { name: true, address: true } } } },
} as const;

/** Tells the assignee a check was scheduled for them (skipped when they did it themselves). */
export async function notifyQualityCheckAssigned(checkId: string, byEmail: string | null) {
  const check = await prisma.janitorialQualityCheck.findUnique({ where: { id: checkId }, select: CHECK_SELECT });
  const to = check?.assignedUser?.email;
  if (!check || !to || to.toLowerCase() === byEmail?.toLowerCase()) return;
  const names = await namesByEmail([to, ...(byEmail ? [byEmail] : [])]);
  const by = byEmail ? (names.get(byEmail.toLowerCase()) ?? byEmail) : "Someone";
  const link = `/erp/janitorial/quality-checks/${check.id}`;
  const building = check.recurringContract.building;
  await sendEmail({
    type: "QUALITY_CHECK_ASSIGNED",
    to,
    link,
    subject: `Quality check at ${building.name} on ${formatDay(check.scheduledDate)}`,
    html: buildQualityCheckEmail({
      heading: "You have a quality check",
      intro: `${by} scheduled you for a quality check. Check the key areas, talk with the property manager, and give the team any updates.`,
      checks: [{ building: building.name, address: building.address, date: formatDay(check.scheduledDate), assignee: checkerName({ email: to }, names), notes: check.notes }],
      url: `${appUrl()}${link}`,
      buttonLabel: "Open check",
    }),
  }).catch((e) => console.error("QUALITY_CHECK_ASSIGNED email failed", e));
}

/**
 * Daily: emails each assignee tomorrow's checks, and sends one "overdue"
 * email (assignee plus every Admin) for checks from yesterday or earlier
 * that weren't marked done.
 */
export async function sendQualityCheckReminders(todayKey: string = todayEasternKey()) {
  const day = (key: string) => new Date(`${key}T00:00:00.000Z`);
  const [tomorrow, overdue, admins] = await Promise.all([
    prisma.janitorialQualityCheck.findMany({
      where: { status: "SCHEDULED", scheduledDate: day(addDaysKey(todayKey, 1)), assignedUserId: { not: null } },
      select: CHECK_SELECT,
    }),
    prisma.janitorialQualityCheck.findMany({
      where: { status: "SCHEDULED", scheduledDate: { lt: day(todayKey) }, overdueEmailSentAt: null },
      select: CHECK_SELECT,
    }),
    prisma.erpUser.findMany({ where: { role: "ADMIN" }, select: { email: true } }),
  ]);

  const names = await namesByEmail([...tomorrow, ...overdue].flatMap((c) => (c.assignedUser ? [c.assignedUser.email] : [])));
  const row = (c: (typeof tomorrow)[number]) => ({
    building: c.recurringContract.building.name,
    address: c.recurringContract.building.address,
    date: formatDay(c.scheduledDate),
    assignee: checkerName(c.assignedUser, names),
    notes: c.notes,
  });

  // One email per person for tomorrow, even with several buildings.
  const byAssignee = new Map<string, typeof tomorrow>();
  for (const c of tomorrow) {
    const email = c.assignedUser!.email;
    byAssignee.set(email, [...(byAssignee.get(email) ?? []), c]);
  }
  let sent = 0;
  for (const [to, checks] of byAssignee) {
    await sendEmail({
      type: "QUALITY_CHECK_REMINDER",
      to,
      link: "/erp/schedule?calendar=management",
      subject: checks.length === 1 ? `Quality check tomorrow at ${checks[0]!.recurringContract.building.name}` : `${checks.length} quality checks tomorrow`,
      html: buildQualityCheckEmail({
        heading: "Quality check tomorrow",
        intro: "Check the key areas, talk with the property manager, and give the team any updates. Fill out the check form on your phone during the visit.",
        checks: checks.map(row),
        url: checks.length === 1 ? `${appUrl()}/erp/janitorial/quality-checks/${checks[0]!.id}` : `${appUrl()}/erp/schedule?calendar=management`,
        buttonLabel: checks.length === 1 ? "Open check" : "Open calendar",
      }),
    })
      .then(() => sent++)
      .catch((e) => console.error("QUALITY_CHECK_REMINDER email failed", e));
  }

  for (const c of overdue) {
    const link = `/erp/janitorial/quality-checks/${c.id}`;
    const to = [...new Set([...(c.assignedUser ? [c.assignedUser.email] : []), ...admins.map((a) => a.email)])];
    // Claim it first so a second run the same morning can't send it again.
    const claimed = await prisma.janitorialQualityCheck.updateMany({ where: { id: c.id, overdueEmailSentAt: null }, data: { overdueEmailSentAt: new Date() } });
    if (!claimed.count || !to.length) continue;
    await sendEmail({
      type: "QUALITY_CHECK_OVERDUE",
      to,
      link,
      subject: `Overdue quality check at ${c.recurringContract.building.name}`,
      html: buildQualityCheckEmail({
        heading: "Quality check overdue",
        intro: "This check was scheduled but hasn't been finished. Fill out the check or move it to a new date on the contract's Quality tab.",
        checks: [row(c)],
        url: `${appUrl()}${link}`,
        buttonLabel: "Open check",
      }),
    })
      .then(() => sent++)
      .catch((e) => console.error("QUALITY_CHECK_OVERDUE email failed", e));
  }

  return { sent, tomorrow: tomorrow.length, overdue: overdue.length };
}

// ---- Follow-through after a visit: janitor notices and the property manager summary ----

/** How long a finished check's notes stay on janitors' clock-in pages if they don't tap "seen". */
export const NOTICE_DAYS = 14;
/** Most photos attached to one property manager summary. */
export const SUMMARY_MAX_PHOTOS = 6;

/** Janitors with a weekly shift at this building that hasn't ended. */
export async function janitorsAtContract(contractId: string, todayKey: string = todayEasternKey()) {
  const patterns = await prisma.janitorialShiftPattern.findMany({
    where: {
      recurringContractId: contractId,
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: new Date(`${todayKey}T00:00:00.000Z`) } }],
      employee: { status: "ACTIVE" },
    },
    select: { employee: { select: { id: true, firstName: true, lastName: true, email: true, clockToken: true } } },
  });
  return [...new Map(patterns.map((p) => [p.employee.id, p.employee])).values()];
}

/**
 * Emails the building's janitors the areas that need attention and the team
 * updates, once per check (the clock-in page shows them too). Called when a
 * check is first finished.
 */
export async function notifyTeamAfterCheck(checkId: string) {
  const check = await prisma.janitorialQualityCheck.findUnique({
    where: { id: checkId },
    select: {
      scheduledDate: true,
      areaResults: true,
      teamUpdates: true,
      recurringContractId: true,
      recurringContract: { select: { building: { select: { name: true } } } },
    },
  });
  if (!check) return;
  const areas = needsAttention(parseAreaResults(check.areaResults));
  if (!areas.length && !check.teamUpdates) return;
  const claimed = await prisma.janitorialQualityCheck.updateMany({ where: { id: checkId, teamNotifiedAt: null }, data: { teamNotifiedAt: new Date() } });
  if (!claimed.count) return;

  const building = check.recurringContract.building.name;
  for (const j of await janitorsAtContract(check.recurringContractId)) {
    if (!j.email) continue;
    await sendEmail({
      type: "QUALITY_CHECK_TEAM_NOTICE",
      to: j.email,
      link: `/erp/janitorial/quality-checks/${checkId}`,
      subject: `Site visit notes for ${building} / Notas de la visita`,
      html: buildQualityTeamNoticeEmail({
        firstName: j.firstName,
        building,
        dateLabel: formatDay(check.scheduledDate),
        areas: areas.map((a) => ({ area: a.area, note: a.note || null })),
        teamUpdates: check.teamUpdates,
        clockUrl: j.clockToken ? `${appUrl()}/clock/${j.clockToken}` : null,
      }),
    }).catch((e) => console.error("QUALITY_CHECK_TEAM_NOTICE email failed", e));
  }
}

/** Notes from recent finished checks at this janitor's buildings that they haven't marked seen, for the clock-in page. */
export async function noticesForJanitor(employeeId: string, todayKey: string = todayEasternKey()) {
  const contractIds = (
    await prisma.janitorialShiftPattern.findMany({
      where: { employeeId, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: new Date(`${todayKey}T00:00:00.000Z`) } }] },
      select: { recurringContractId: true },
      distinct: ["recurringContractId"],
    })
  ).map((p) => p.recurringContractId);
  if (!contractIds.length) return [];
  const since = new Date(Date.now() - NOTICE_DAYS * 86_400_000);
  const checks = await prisma.janitorialQualityCheck.findMany({
    where: { recurringContractId: { in: contractIds }, status: "DONE", completedAt: { gte: since }, noticesSeen: { none: { employeeId } } },
    orderBy: { completedAt: "desc" },
    select: {
      id: true,
      scheduledDate: true,
      areaResults: true,
      teamUpdates: true,
      recurringContract: { select: { building: { select: { name: true } } } },
      photos: { select: { id: true, area: true } },
    },
  });
  return checks
    .map((c) => {
      const areas = needsAttention(parseAreaResults(c.areaResults)).map((a) => ({
        area: a.area,
        note: a.note || null,
        photoIds: c.photos.filter((p) => p.area?.toLowerCase() === a.area.toLowerCase()).map((p) => p.id),
      }));
      return { id: c.id, date: utcDateKey(c.scheduledDate), buildingName: c.recurringContract.building.name, areas, teamUpdates: c.teamUpdates };
    })
    .filter((n) => n.areas.length || n.teamUpdates);
}

/** Who can get the summary: property managers with a link to the building, plus the building's own contact if different. */
export async function summaryRecipients(contractId: string) {
  const contract = await prisma.recurringContract.findUnique({
    where: { id: contractId },
    select: {
      building: {
        select: {
          pmName: true,
          pmEmail: true,
          propertyManagers: { where: { propertyManager: { active: true } }, select: { propertyManager: { select: { id: true, name: true, email: true } } } },
        },
      },
    },
  });
  if (!contract) return [];
  const list: { email: string; name: string; source: "link" | "building"; managerId: string | null }[] = contract.building.propertyManagers.map(({ propertyManager: m }) => ({
    email: m.email,
    name: m.name,
    source: "link",
    managerId: m.id,
  }));
  const pmEmail = contract.building.pmEmail?.trim();
  if (pmEmail && !list.some((r) => r.email.toLowerCase() === pmEmail.toLowerCase())) {
    list.push({ email: pmEmail, name: contract.building.pmName?.trim() || pmEmail, source: "building", managerId: null });
  }
  return list;
}

export type SummaryOptions = { message: string; includeNotes: boolean; includeDiscussion: boolean; includePhotos: boolean };

/** The property manager summary email for a finished check. Photos (needs-attention areas first) only when asked. */
export async function buildCheckSummary(checkId: string, opts: SummaryOptions) {
  const check = await prisma.janitorialQualityCheck.findUnique({
    where: { id: checkId },
    select: {
      status: true,
      scheduledDate: true,
      areaResults: true,
      propertyManagerNotes: true,
      completedBy: true,
      assignedUser: { select: { email: true } },
      recurringContract: { select: { building: { select: { name: true } } } },
      photos: { orderBy: { createdAt: "asc" }, select: { id: true, area: true, mimeType: true } },
    },
  });
  if (!check) return null;
  const results = parseAreaResults(check.areaResults).filter((r) => r.rating);
  const building = check.recurringContract.building.name;

  // The person who did the visit is the contact (replies go to whoever sends it).
  const contactEmail = check.completedBy ?? check.assignedUser?.email ?? null;
  const names = await namesByEmail(contactEmail ? [contactEmail] : []);
  const contact = contactEmail ? { name: names.get(contactEmail.toLowerCase()) ?? null, phone: null, email: contactEmail } : null;

  let photoIds: string[] = [];
  if (opts.includePhotos) {
    const flagged = new Set(results.filter((r) => r.rating === "NEEDS_ATTENTION").map((r) => r.area.toLowerCase()));
    photoIds = [...check.photos]
      .sort((a, b) => Number(flagged.has(b.area?.toLowerCase() ?? "")) - Number(flagged.has(a.area?.toLowerCase() ?? "")))
      .slice(0, SUMMARY_MAX_PHOTOS)
      .map((p) => p.id);
  }

  const html = buildQualityCheckSummaryEmail({
    building,
    dateLabel: formatDay(check.scheduledDate),
    message: opts.message.trim(),
    areas: results.map((r) => ({ area: r.area, good: r.rating === "GOOD", note: opts.includeNotes && r.note.trim() ? r.note.trim() : null })),
    discussion: opts.includeDiscussion ? check.propertyManagerNotes : null,
    photoCount: photoIds.length,
    contact,
  });
  return { done: check.status === "DONE", building, subject: `Site visit summary: ${building}, ${formatDay(check.scheduledDate)}`, html, photoIds, photoTotal: check.photos.length };
}

/** Loads the chosen photos as email attachments. */
export async function summaryAttachments(photoIds: string[]) {
  if (!photoIds.length) return [];
  const photos = await prisma.janitorialQualityPhoto.findMany({ where: { id: { in: photoIds } }, select: { id: true, area: true, data: true, mimeType: true } });
  const ext = (mime: string) => (mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime.startsWith("image/hei") ? "heic" : "jpg");
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "photo";
  return photoIds
    .map((id) => photos.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p, i) => ({ filename: `${slug(p.area ?? "visit")}-${i + 1}.${ext(p.mimeType)}`, content: Buffer.from(p.data) }));
}
