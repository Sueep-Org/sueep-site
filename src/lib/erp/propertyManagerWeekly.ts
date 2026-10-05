/**
 * Monday morning "Your turnovers this week" email to each property manager
 * with something on this week, or a request still waiting on us. Skips
 * anyone whose Monday email is off, and anyone already sent one this week,
 * so a re-run is harmless. Server only.
 */

import { prisma } from "@/lib/prisma";
import { buildPropertyManagerWeeklyEmail, sendEmail } from "@/lib/email";
import { todayEasternKey } from "./dates";
import { emailExtrasFor } from "./propertyManagerAccess";
import { loadPropertyManagerCalendar, type PmUnit } from "./propertyManagerCalendar";

const STATUS_WORDS: Partial<Record<PmUnit["status"], string>> = { SCHEDULED: "Booked", IN_PROGRESS: "Being worked on", ON_HOLD: "On hold" };

function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function short(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function dates(u: PmUnit): string {
  if (!u.start) return "";
  return u.end && u.end > u.start ? `${short(u.start)} to ${short(u.end)}` : short(u.start);
}

export async function sendPropertyManagerWeeklyEmails(): Promise<{ sent: number; skipped: number }> {
  // Monday to Sunday of this week, Eastern.
  const today = todayEasternKey();
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = addDays(today, -((dow + 6) % 7));
  const sunday = addDays(monday, 6);
  const weekStart = new Date(`${monday}T00:00:00Z`);

  const managers = await prisma.propertyManager.findMany({
    where: {
      active: true,
      weeklyEmail: true,
      buildings: { some: {} },
      OR: [{ weeklyEmailSentAt: null }, { weeklyEmailSentAt: { lt: weekStart } }],
    },
    select: { id: true, name: true, email: true },
  });

  let sent = 0;
  let skipped = 0;
  for (const m of managers) {
    try {
      const { buildings, units } = await loadPropertyManagerCalendar(m.id);
      const showBuilding = buildings.length > 1;
      const name = new Map(buildings.map((b) => [b.id, b.name]));
      const what = (u: PmUnit) => `${showBuilding ? `${name.get(u.buildingId) ?? ""} ` : ""}#${u.unitNumber}`;

      const thisWeek = units
        .filter((u) => u.kind === "unit" && STATUS_WORDS[u.status] && u.start && u.start <= sunday && (u.end && u.end > u.start ? u.end : u.start) >= monday)
        .sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));
      const waiting = units.filter((u) => u.status === "REQUESTED" || u.pendingChange);
      if (!thisWeek.length && !waiting.length) {
        skipped++;
        continue;
      }

      const { url, contact } = await emailExtrasFor(m.id);
      await sendEmail({
        type: "PROPERTY_MANAGER_WEEKLY",
        to: m.email,
        link: "/erp/property-managers",
        subject: thisWeek.length ? `Your turnovers this week (${thisWeek.length})` : "Your turnover requests",
        html: buildPropertyManagerWeeklyEmail({
          firstName: m.name.split(" ")[0] || m.name,
          weekLabel: `${short(monday)} to ${short(sunday)}`,
          thisWeek: thisWeek.map((u) => ({ what: what(u), dates: dates(u), status: STATUS_WORDS[u.status]! })),
          waiting: waiting.map((u) => ({
            what: what(u),
            detail: u.pendingChange
              ? u.pendingChange.kind === "CANCEL"
                ? "you asked to cancel"
                : `you asked to move it to ${short(u.pendingChange.newStart!)}`
              : `requested for ${short(u.start!)}`,
          })),
          url,
          contact,
        }),
      });
      await prisma.propertyManager.update({ where: { id: m.id }, data: { weeklyEmailSentAt: new Date() } });
      sent++;
    } catch (e) {
      console.error(`Weekly email to property manager ${m.id} failed:`, e);
    }
  }
  return { sent, skipped };
}
