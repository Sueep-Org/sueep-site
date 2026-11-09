/**
 * The Users page's Subs and Property managers tabs: everyone with a private
 * page (/sub/[token], /pm/[token]), what they've done on it, and turning it
 * off or on. PM, Business Manager and Admin.
 *
 * Turning a page off never deletes the person or their history: the link
 * stops working, their phones are signed out, and the reason is kept on a
 * PortalAccessEvent. Turn back on makes a new link and emails it.
 */
import { prisma } from "@/lib/prisma";
import { ensurePortalToken, sendPortalWelcomeEmail, subPortalUrl } from "./subPortalAccess";
import { sendWelcomeEmail as sendPropertyManagerWelcome } from "./propertyManagerAccess";
import { newPropertyManagerToken, propertyManagerLinkUrl } from "./propertyManagers";

export type PortalKind = "sub" | "pm";
/** NO_LINK only for subs: property managers always have a link */
export type PortalStatus = "ACTIVE" | "NEVER_OPENED" | "OFF" | "NO_LINK";

export type PortalUserRow = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  status: PortalStatus;
  url: string | null;
  lastSeenAt: string | null;
  devices: number;
  /** Things they did on their page in the last 30 days */
  recentActions: number;
  /** When it's off: why, who, when */
  offReason: string | null;
  offBy: string | null;
  offAt: string | null;
  /** Where staff manage the person otherwise */
  profileHref: string;
};

export type ActivityItem = { at: string; text: string };

const RECENT_DAYS = 30;

function since(days: number): Date {
  return new Date(Date.now() - days * 864e5);
}

function statusOf(hasLink: boolean, off: boolean, lastSeenAt: Date | null): PortalStatus {
  if (!hasLink) return "NO_LINK";
  if (off) return "OFF";
  return lastSeenAt ? "ACTIVE" : "NEVER_OPENED";
}

/** Latest Turn off event per person, for the reason shown on the row */
async function lastOffEvents(where: { contractorId: { in: string[] } } | { propertyManagerId: { in: string[] } }) {
  const events = await prisma.portalAccessEvent.findMany({
    where: { ...where, action: "TURNED_OFF" },
    orderBy: { createdAt: "desc" },
    select: { contractorId: true, propertyManagerId: true, reason: true, by: true, createdAt: true },
  });
  const out = new Map<string, (typeof events)[number]>();
  for (const e of events) {
    const id = e.contractorId ?? e.propertyManagerId;
    if (id && !out.has(id)) out.set(id, e);
  }
  return out;
}

function countBy<T>(rows: T[], key: (r: T) => string | null | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (k) out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

/** Active subs, plus anyone who still has a portal link */
export async function loadSubPortalUsers(): Promise<PortalUserRow[]> {
  const subs = await prisma.contractor.findMany({
    where: { OR: [{ status: "ACTIVE" }, { portalToken: { not: null } }] },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      portalToken: true,
      portalLastSeenAt: true,
      portalTurnedOffAt: true,
      _count: { select: { portalDevices: true } },
    },
  });
  const ids = subs.map((s) => s.id);
  const emails = subs.flatMap((s) => (s.email ? [s.email.toLowerCase()] : []));
  const recent = since(RECENT_DAYS);
  const [answers, coRequests, devices, offs] = await Promise.all([
    emails.length
      ? prisma.scheduleConfirmation.findMany({ where: { respondedAt: { gte: recent }, personEmail: { in: emails, mode: "insensitive" } }, select: { personEmail: true } })
      : [],
    prisma.subCoRequest.findMany({ where: { contractorId: { in: ids }, createdAt: { gte: recent } }, select: { contractorId: true } }),
    prisma.contractorPortalDevice.findMany({ where: { contractorId: { in: ids }, createdAt: { gte: recent } }, select: { contractorId: true } }),
    lastOffEvents({ contractorId: { in: ids } }),
  ]);
  const answersBy = countBy(answers, (a) => a.personEmail.toLowerCase());
  const coBy = countBy(coRequests, (r) => r.contractorId);
  const devicesBy = countBy(devices, (d) => d.contractorId);

  return subs.map((s) => {
    const off = offs.get(s.id);
    return {
      id: s.id,
      name: s.name,
      company: s.role,
      email: s.email,
      status: statusOf(!!s.portalToken, !!s.portalTurnedOffAt, s.portalLastSeenAt),
      url: s.portalToken ? subPortalUrl(s.portalToken) : null,
      lastSeenAt: s.portalLastSeenAt?.toISOString() ?? null,
      devices: s._count.portalDevices,
      recentActions: (s.email ? (answersBy.get(s.email.toLowerCase()) ?? 0) : 0) + (coBy.get(s.id) ?? 0) + (devicesBy.get(s.id) ?? 0),
      offReason: s.portalTurnedOffAt ? (off?.reason ?? null) : null,
      offBy: s.portalTurnedOffAt ? (off?.by ?? null) : null,
      offAt: s.portalTurnedOffAt?.toISOString() ?? null,
      profileHref: `/erp/contractors/${s.id}`,
    };
  });
}

export async function loadPmPortalUsers(): Promise<PortalUserRow[]> {
  const pms = await prisma.propertyManager.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, company: true, email: true, token: true, active: true, lastSeenAt: true, _count: { select: { devices: true } } },
  });
  const ids = pms.map((p) => p.id);
  const recent = since(RECENT_DAYS);
  const [requests, changes, devices, offs] = await Promise.all([
    prisma.propertyManagerRequest.findMany({ where: { propertyManagerId: { in: ids }, createdAt: { gte: recent } }, select: { propertyManagerId: true } }),
    prisma.propertyManagerChange.findMany({ where: { propertyManagerId: { in: ids }, createdAt: { gte: recent } }, select: { propertyManagerId: true } }),
    prisma.propertyManagerDevice.findMany({ where: { propertyManagerId: { in: ids }, createdAt: { gte: recent } }, select: { propertyManagerId: true } }),
    lastOffEvents({ propertyManagerId: { in: ids } }),
  ]);
  const requestsBy = countBy(requests, (r) => r.propertyManagerId);
  const changesBy = countBy(changes, (r) => r.propertyManagerId);
  const devicesBy = countBy(devices, (d) => d.propertyManagerId);

  return pms.map((p) => {
    const off = !p.active ? offs.get(p.id) : undefined;
    return {
      id: p.id,
      name: p.name,
      company: p.company,
      email: p.email,
      status: statusOf(true, !p.active, p.lastSeenAt),
      url: propertyManagerLinkUrl(p.token),
      lastSeenAt: p.lastSeenAt?.toISOString() ?? null,
      devices: p._count.devices,
      recentActions: (requestsBy.get(p.id) ?? 0) + (changesBy.get(p.id) ?? 0) + (devicesBy.get(p.id) ?? 0),
      offReason: off?.reason ?? null,
      offBy: off?.by ?? null,
      // Turned off on the Property Managers page before events were kept has no date
      offAt: off?.createdAt.toISOString() ?? null,
      profileHref: "/erp/property-managers",
    };
  });
}

const ACTION_TEXT: Record<string, string> = {
  TURNED_OFF: "Page turned off",
  TURNED_ON: "Page turned back on, new link sent",
  SIGNED_OUT: "Phones signed out",
  NEW_LINK: "New link made, old one stopped working",
};

function staffEventText(e: { action: string; reason: string | null; by: string }): string {
  return `${ACTION_TEXT[e.action] ?? e.action} by ${e.by}${e.reason ? `: ${e.reason}` : ""}`;
}

function phoneName(userAgent: string | null): string {
  if (!userAgent) return "a device";
  if (/iPhone/i.test(userAgent)) return "an iPhone";
  if (/iPad/i.test(userAgent)) return "an iPad";
  if (/Android/i.test(userAgent)) return "an Android phone";
  if (/Macintosh/i.test(userAgent)) return "a Mac";
  if (/Windows/i.test(userAgent)) return "a Windows computer";
  return "a device";
}

function dayText(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const LIMIT = 40;

/** Newest first: what they did on their page, and what staff did to it */
export async function loadSubActivity(contractorId: string): Promise<ActivityItem[]> {
  const c = await prisma.contractor.findUnique({ where: { id: contractorId }, select: { email: true } });
  if (!c) return [];
  const [devices, answers, coRequests, events, emails] = await Promise.all([
    prisma.contractorPortalDevice.findMany({ where: { contractorId }, orderBy: { createdAt: "desc" }, take: LIMIT, select: { createdAt: true, userAgent: true } }),
    c.email
      ? prisma.scheduleConfirmation.findMany({
          where: { personEmail: { equals: c.email, mode: "insensitive" }, respondedAt: { not: null } },
          orderBy: { respondedAt: "desc" },
          take: LIMIT,
          select: { respondedAt: true, status: true, title: true, dateKey: true, reason: true },
        })
      : [],
    prisma.subCoRequest.findMany({
      where: { contractorId },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
      select: { createdAt: true, project: { select: { jobTitle: true } } },
    }),
    prisma.portalAccessEvent.findMany({ where: { contractorId }, orderBy: { createdAt: "desc" }, take: LIMIT }),
    c.email
      ? prisma.emailLog.findMany({
          where: { type: "SUB_PORTAL_WELCOME", status: "SENT", to: { has: c.email } },
          orderBy: { createdAt: "desc" },
          take: LIMIT,
          select: { createdAt: true },
        })
      : [],
  ]);
  const items: { at: Date; text: string }[] = [
    ...devices.map((d) => ({ at: d.createdAt, text: `Signed in on ${phoneName(d.userAgent)}` })),
    ...answers.map((a) => ({
      at: a.respondedAt!,
      text: `${a.status === "DECLINED" ? "Can't make it" : a.status === "CONFIRMED" ? "Confirmed" : "Answered"}: ${a.title}, ${dayText(new Date(`${a.dateKey}T00:00:00Z`))}${a.status === "DECLINED" && a.reason ? ` (${a.reason})` : ""}`,
    })),
    ...coRequests.map((r) => ({ at: r.createdAt, text: `Requested a change order: ${r.project.jobTitle}` })),
    ...events.map((e) => ({ at: e.createdAt, text: staffEventText(e) })),
    ...emails.map((e) => ({ at: e.createdAt, text: "Portal link emailed" })),
  ];
  return items
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, LIMIT)
    .map((i) => ({ at: i.at.toISOString(), text: i.text }));
}

export async function loadPmActivity(propertyManagerId: string): Promise<ActivityItem[]> {
  const pm = await prisma.propertyManager.findUnique({ where: { id: propertyManagerId }, select: { email: true } });
  if (!pm) return [];
  const [devices, requests, changes, events, emails] = await Promise.all([
    prisma.propertyManagerDevice.findMany({ where: { propertyManagerId }, orderBy: { createdAt: "desc" }, take: LIMIT, select: { createdAt: true, userAgent: true } }),
    prisma.propertyManagerRequest.findMany({
      where: { propertyManagerId },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
      select: { createdAt: true, unitNumber: true, isCommonArea: true, building: { select: { name: true } } },
    }),
    prisma.propertyManagerChange.findMany({
      where: { propertyManagerId },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
      select: { createdAt: true, kind: true, newStartDate: true, building: { select: { name: true } } },
    }),
    prisma.portalAccessEvent.findMany({ where: { propertyManagerId }, orderBy: { createdAt: "desc" }, take: LIMIT }),
    prisma.emailLog.findMany({
      where: { type: "PROPERTY_MANAGER_WELCOME", status: "SENT", to: { has: pm.email } },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
      select: { createdAt: true },
    }),
  ]);
  const items: { at: Date; text: string }[] = [
    ...devices.map((d) => ({ at: d.createdAt, text: `Signed in on ${phoneName(d.userAgent)}` })),
    ...requests.map((r) => ({ at: r.createdAt, text: `Requested a turnover: ${r.building.name}, ${r.isCommonArea ? r.unitNumber : `unit ${r.unitNumber}`}` })),
    ...changes.map((c) => ({
      at: c.createdAt,
      text: c.kind === "CANCEL" ? `Asked to cancel a turnover at ${c.building.name}` : `Asked to move a turnover at ${c.building.name}${c.newStartDate ? ` to ${dayText(c.newStartDate)}` : ""}`,
    })),
    ...events.map((e) => ({ at: e.createdAt, text: staffEventText(e) })),
    ...emails.map((e) => ({ at: e.createdAt, text: "Page link emailed" })),
  ];
  return items
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, LIMIT)
    .map((i) => ({ at: i.at.toISOString(), text: i.text }));
}

export type PortalAction = "off" | "on" | "sign-out";

/** Turn off, turn back on, or sign out phones. Returns a short note for the toast. */
export async function runPortalAction(
  kind: PortalKind,
  id: string,
  action: PortalAction,
  by: string,
  reasonRaw: string | null,
): Promise<{ ok: true; note: string } | { error: string; status: number }> {
  const reason = reasonRaw?.trim().slice(0, 500) || null;
  if (action === "off" && !reason) return { error: "Say why you're turning it off", status: 400 };

  if (kind === "sub") {
    const c = await prisma.contractor.findUnique({ where: { id }, select: { portalToken: true, portalTurnedOffAt: true, email: true } });
    if (!c) return { error: "Not found", status: 404 };
    if (action === "off") {
      if (!c.portalToken) return { error: "They don't have a page yet", status: 400 };
      await prisma.$transaction([
        prisma.contractor.update({ where: { id }, data: { portalTurnedOffAt: new Date() } }),
        prisma.contractorPortalDevice.deleteMany({ where: { contractorId: id } }),
        prisma.contractorPortalSignInLink.deleteMany({ where: { contractorId: id } }),
        prisma.portalAccessEvent.create({ data: { contractorId: id, action: "TURNED_OFF", reason, by } }),
      ]);
      return { ok: true, note: "Page turned off. Their link stopped working." };
    }
    if (action === "on") {
      // Also how a sub with no page yet gets their first link
      await prisma.contractor.update({ where: { id }, data: { portalTurnedOffAt: null } });
      await ensurePortalToken(id, true);
      if (c.portalTurnedOffAt) await prisma.portalAccessEvent.create({ data: { contractorId: id, action: "TURNED_ON", by } });
      const sent = await sendPortalWelcomeEmail(id);
      return { ok: true, note: "error" in sent ? `Page is on with a new link, but the email didn't go: ${sent.error}` : `Page is on. New link emailed to ${c.email}.` };
    }
    await prisma.$transaction([
      prisma.contractorPortalDevice.deleteMany({ where: { contractorId: id } }),
      prisma.contractorPortalSignInLink.deleteMany({ where: { contractorId: id } }),
      prisma.portalAccessEvent.create({ data: { contractorId: id, action: "SIGNED_OUT", by } }),
    ]);
    return { ok: true, note: "Signed out of every phone. They'll need a code next time." };
  }

  const pm = await prisma.propertyManager.findUnique({ where: { id }, select: { email: true } });
  if (!pm) return { error: "Not found", status: 404 };
  if (action === "off") {
    await prisma.$transaction([
      prisma.propertyManager.update({ where: { id }, data: { active: false } }),
      prisma.propertyManagerDevice.deleteMany({ where: { propertyManagerId: id } }),
      prisma.propertyManagerSignInLink.deleteMany({ where: { propertyManagerId: id } }),
      prisma.portalAccessEvent.create({ data: { propertyManagerId: id, action: "TURNED_OFF", reason, by } }),
    ]);
    return { ok: true, note: "Page turned off. Their link stopped working." };
  }
  if (action === "on") {
    await prisma.$transaction([
      prisma.propertyManager.update({ where: { id }, data: { active: true, token: newPropertyManagerToken() } }),
      prisma.propertyManagerDevice.deleteMany({ where: { propertyManagerId: id } }),
      prisma.propertyManagerSignInLink.deleteMany({ where: { propertyManagerId: id } }),
      prisma.portalAccessEvent.create({ data: { propertyManagerId: id, action: "TURNED_ON", by } }),
    ]);
    const sent = await sendPropertyManagerWelcome(id);
    return { ok: true, note: "error" in sent ? `Page is on with a new link, but the email didn't go: ${sent.error}` : `Page is on. New link emailed to ${pm.email}.` };
  }
  await prisma.$transaction([
    prisma.propertyManagerDevice.deleteMany({ where: { propertyManagerId: id } }),
    prisma.propertyManagerSignInLink.deleteMany({ where: { propertyManagerId: id } }),
    prisma.portalAccessEvent.create({ data: { propertyManagerId: id, action: "SIGNED_OUT", by } }),
  ]);
  return { ok: true, note: "Signed out of every device. They'll need a code next time." };
}
