/**
 * How many people a sub is bringing to the days they run, and their names
 * (optional). Set when they accept an offer, or from Upcoming in their
 * portal. Saved on each day row with whose crew it is (subCrewContractorId),
 * so a different sub on the day doesn't inherit it.
 *
 * They can change it until the day before; a change emails the day's PM
 * plus the "Sub crew changed" recipients.
 */
import { prisma } from "@/lib/prisma";
import { escapeHtml, sendEmail } from "@/lib/email";
import { getNotificationSetting } from "@/lib/notificationSettings";
import { dayKey } from "@/lib/erp/schedule";
import { todayEasternKey } from "@/lib/erp/dates";
import { appUrl } from "@/lib/erp/scheduleInvites";
import { tr, type Lang } from "@/lib/erp/language";

export const MAX_CREW = 50;
const MAX_NAMES = 50;

export type CrewDayRef = { kind: "day" | "co-day"; dayId: string };

/** Cleans a typed list of names: one per line or comma, trimmed, no blanks or repeats. */
export function parseCrewNames(v: unknown): string[] {
  const raw = Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(/[\n,]/) : [];
  return [...new Set(raw.map((n) => n.trim().slice(0, 80)).filter(Boolean))].slice(0, MAX_NAMES);
}

export function parseCrewCount(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= MAX_CREW ? n : null;
}

/** The crew on a day, only while it's still that sub's day */
export function crewOf(d: { supervisorContractorId: string | null; subCrewContractorId: string | null; subCrewCount: number | null; subCrewNames: string[] }) {
  if (!d.supervisorContractorId || d.subCrewContractorId !== d.supervisorContractorId || d.subCrewCount == null) return null;
  return { count: d.subCrewCount, names: d.subCrewNames };
}

function crewText(c: { count: number; names: string[] } | null): string {
  if (!c) return "not set";
  return `${c.count} ${c.count === 1 ? "person" : "people"}${c.names.length ? ` (${c.names.join(", ")})` : ""}`;
}

/**
 * Saves the crew on these days for this sub. `from` is the first day key
 * they can still change: today when accepting an offer, tomorrow afterwards.
 * Days that aren't theirs, or are too soon, are left alone.
 */
export async function setCrew(
  contractorId: string,
  refs: CrewDayRef[],
  count: number,
  names: string[],
  opts: { lang: Lang; alert: boolean; allowToday?: boolean },
): Promise<{ ok: true; saved: number } | { error: string }> {
  const today = todayEasternKey();
  const select = { id: true, date: true, supervisorContractorId: true, subCrewContractorId: true, subCrewCount: true, subCrewNames: true } as const;
  const dayIds = refs.filter((r) => r.kind === "day").map((r) => r.dayId);
  const coIds = refs.filter((r) => r.kind === "co-day").map((r) => r.dayId);
  const [days, coDays] = await Promise.all([
    dayIds.length
      ? prisma.projectDayAssignment.findMany({ where: { id: { in: dayIds } }, select: { ...select, projectId: true, projectManager: { select: { email: true } }, project: { select: { jobTitle: true } } } })
      : [],
    coIds.length
      ? prisma.changeOrderDayAssignment.findMany({
          where: { id: { in: coIds } },
          select: { ...select, projectManager: { select: { email: true } }, changeOrder: { select: { id: true, title: true, projectId: true, project: { select: { jobTitle: true } } } } },
        })
      : [],
  ]);
  const open = (d: { date: Date; supervisorContractorId: string | null }) =>
    d.supervisorContractorId === contractorId && (opts.allowToday ? dayKey(d.date) >= today : dayKey(d.date) > today);
  const okDays = days.filter(open);
  const okCo = coDays.filter(open);
  if (okDays.length + okCo.length === 0) {
    return { error: tr(opts.lang, { en: "It's too late to change the crew for these days. Call Sueep.", es: "Ya es tarde para cambiar el equipo de estos días. Llama a Sueep." }) };
  }

  const before = [...okDays, ...okCo].map((d) => crewOf(d));
  const data = { subCrewCount: count, subCrewNames: names, subCrewContractorId: contractorId, subCrewSetAt: new Date() };
  await prisma.$transaction([
    prisma.projectDayAssignment.updateMany({ where: { id: { in: okDays.map((d) => d.id) } }, data }),
    prisma.changeOrderDayAssignment.updateMany({ where: { id: { in: okCo.map((d) => d.id) } }, data }),
  ]);

  // Only a real change to a crew they already gave is news
  const changed = before.some((b) => b && (b.count !== count || b.names.join("|") !== names.join("|")));
  if (opts.alert && changed) {
    const first = okDays[0] ?? null;
    const firstCo = okCo[0] ?? null;
    const title = first ? first.project.jobTitle : firstCo ? `${firstCo.changeOrder.title} (${firstCo.changeOrder.project.jobTitle})` : "a job";
    const path = first ? `/erp/projects/${first.projectId}` : firstCo ? `/erp/projects/${firstCo.changeOrder.projectId}/change-orders/${firstCo.changeOrder.id}` : undefined;
    const keys = [...okDays, ...okCo].map((d) => dayKey(d.date)).sort();
    const pms = [...okDays, ...okCo].flatMap((d) => (d.projectManager?.email ? [d.projectManager.email] : []));
    const sub = await prisma.contractor.findUnique({ where: { id: contractorId }, select: { name: true } });
    const oldCrew = before.find(Boolean) ?? null;
    await notifyCrewChanged({ subName: sub?.name ?? "A sub", title, path, keys, from: oldCrew, to: { count, names }, pms }).catch((e) =>
      console.error("Crew change alert failed", { contractorId }, e),
    );
  }
  return { ok: true, saved: okDays.length + okCo.length };
}

function dayLabel(k: string): string {
  return new Date(`${k}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

async function notifyCrewChanged(p: {
  subName: string;
  title: string;
  path: string | undefined;
  keys: string[];
  from: { count: number; names: string[] } | null;
  to: { count: number; names: string[] };
  pms: string[];
}): Promise<void> {
  const also = (await getNotificationSetting("SUB_CREW_CHANGED")).to;
  const base = appUrl();
  const job = p.path && base ? `<a href="${escapeHtml(`${base}${p.path}`)}">${escapeHtml(p.title)}</a>` : escapeHtml(p.title);
  const range = p.keys.length > 1 ? `${dayLabel(p.keys[0]!)} - ${dayLabel(p.keys[p.keys.length - 1]!)}` : dayLabel(p.keys[0]!);
  await sendEmail({
    type: "SUB_CREW_CHANGED",
    to: [...new Set([...p.pms, ...also])],
    link: p.path,
    subject: `Crew changed: ${p.subName}, ${p.title}, ${range}`,
    html: `<p><strong>${escapeHtml(p.subName)}</strong> changed their crew for ${job} (${escapeHtml(range)}).</p><p><strong>Before:</strong> ${escapeHtml(crewText(p.from))}<br><strong>Now:</strong> ${escapeHtml(crewText(p.to))}</p>`,
  });
}
