/**
 * Weekday-morning nudge to staff about property manager requests and
 * changes nobody has answered for over a business day, so clients aren't
 * left waiting. Sent every weekday until they're answered. Server only.
 */

import { prisma } from "@/lib/prisma";
import { buildPropertyManagerWaitingEmail, sendEmail } from "@/lib/email";

/** The same time one business day ago (Friday, for a Monday run). */
function oneBusinessDayAgo(now: Date): Date {
  const d = new Date(now);
  do {
    d.setUTCDate(d.getUTCDate() - 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d;
}

function shortDay(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" });
}

export async function sendPropertyManagerReminders(now = new Date()): Promise<{ waiting: number; sent: boolean }> {
  const cutoff = oneBusinessDayAgo(now);
  const [requests, changes] = await Promise.all([
    prisma.propertyManagerRequest.findMany({
      where: { status: "REQUESTED", createdAt: { lte: cutoff } },
      orderBy: { createdAt: "asc" },
      select: { unitNumber: true, requesterName: true, source: true, createdAt: true, building: { select: { name: true } } },
    }),
    prisma.propertyManagerChange.findMany({
      where: { status: "OPEN", createdAt: { lte: cutoff } },
      orderBy: { createdAt: "asc" },
      select: { kind: true, projectId: true, requesterName: true, createdAt: true },
    }),
  ]);
  const projects = await prisma.project.findMany({ where: { id: { in: changes.map((c) => c.projectId) } }, select: { id: true, jobTitle: true } });
  const title = new Map(projects.map((p) => [p.id, p.jobTitle]));

  const items = [
    ...requests.map((r) => ({
      what: `New request: ${r.building.name} #${r.unitNumber}${r.source === "WEBSITE" ? " (website)" : ""}`,
      from: r.requesterName,
      at: r.createdAt,
    })),
    ...changes.map((c) => ({
      what: `${c.kind === "CANCEL" ? "Cancel" : "New date"}: ${title.get(c.projectId) ?? "turnover"}`,
      from: c.requesterName,
      at: c.createdAt,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  if (!items.length) return { waiting: 0, sent: false };

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://app.sueep.com").replace(/\/$/, "");
  const result = await sendEmail({
    type: "PROPERTY_MANAGER_WAITING_REMINDER",
    link: "/erp/property-managers/requests",
    subject: `${items.length} property manager request${items.length === 1 ? "" : "s"} waiting`,
    html: buildPropertyManagerWaitingEmail({
      items: items.map((i) => ({ what: i.what, from: i.from, sent: shortDay(i.at) })),
      url: `${appUrl}/erp/property-managers/requests`,
    }),
  });
  return { waiting: items.length, sent: result === "SENT" };
}
