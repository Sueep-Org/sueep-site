/**
 * Job offers to subs (SubJobOffer). Staff offer one sub the saved days of a
 * visit from the day card, with their pay and an answer-by time. The sub
 * answers in their portal (/sub/[token]):
 *
 * - Accept puts them on those days the same way the day card does: running
 *   the day (supervisorContractorId), the visit's pay (subPay.ts), and the
 *   normal schedule invite, already marked confirmed.
 * - Decline needs a reason. A price decline gets a Resend at new price on
 *   the day card: a new offer in the same group, so every round is kept.
 * - No answer by the deadline marks it expired (hourly cron).
 * Declines and expiries alert whoever sent it plus the "Sub job offer
 * declined" recipients; accepts tell whoever sent it.
 *
 * The sub only ever sees their own pay, never our price.
 */
import { prisma } from "@/lib/prisma";
import { escapeHtml, sendEmail } from "@/lib/email";
import { getNotificationSetting } from "@/lib/notificationSettings";
import { dayKey } from "@/lib/erp/schedule";
import { todayEasternKey } from "@/lib/erp/dates";
import { hasCalendarSubPay } from "@/lib/erp/projectSegments";
import { turnoverScopeDisplayLabel } from "@/lib/erp/turnoverScope";
import { appUrl, batchDayInvites, formatInviteWhen, scopeText, sendSubLeadInvite } from "@/lib/erp/scheduleInvites";
import { saveCoSubPay, saveSubPay, syncCoScheduleSubPay, syncScheduleSubPay } from "@/lib/erp/subPay";
import { notifyRequesterAfterConfirm } from "@/lib/erp/scheduleRequester";
import { ensurePortalToken, subEmailButtonUrl } from "@/lib/erp/subPortalAccess";
import { centsToDollars } from "@/lib/erp/money";
import { parseCrewCount, parseCrewNames, setCrew } from "@/lib/erp/subCrew";
import { parseLang, tr, type Lang } from "@/lib/erp/language";

export type OfferKind = "day" | "co-day";
export type OfferStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CANCELLED";
export type DeclineReason = "PRICE" | "NOT_AVAILABLE" | "TOO_FAR" | "OTHER";

export const DECLINE_REASONS: { value: DeclineReason; en: string; es: string }[] = [
  { value: "PRICE", en: "Price is too low", es: "El pago es muy bajo" },
  { value: "NOT_AVAILABLE", en: "Not available those days", es: "No estoy disponible esos días" },
  { value: "TOO_FAR", en: "Too far", es: "Muy lejos" },
  { value: "OTHER", en: "Other", es: "Otro" },
];

export function declineReasonLabel(reason: string | null | undefined, lang: Lang = "en"): string {
  const r = DECLINE_REASONS.find((d) => d.value === reason);
  return r ? r[lang] : (reason ?? "");
}

/** Pay in cents from a request body: null when blank, undefined when it isn't a valid amount. */
export function offerPayFromBody(v: unknown): number | null | undefined {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
}

function isDeclineReason(v: unknown): v is DeclineReason {
  return DECLINE_REASONS.some((d) => d.value === v);
}

/** "Thu, Nov 6, 2:00 PM" Eastern */
export function answerByLabel(d: Date, lang: Lang = "en"): string {
  return d.toLocaleString(lang === "es" ? "es-US" : "en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

function shortDay(key: string, lang: Lang = "en"): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString(lang === "es" ? "es-US" : "en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export function dateRangeLabel(keys: string[], lang: Lang = "en"): string {
  if (keys.length === 0) return "";
  const first = keys[0]!;
  const last = keys[keys.length - 1]!;
  return first === last ? shortDay(first, lang) : `${shortDay(first, lang)} - ${shortDay(last, lang)}`;
}

const DAY_MS = 864e5;

// ── The days an offer covers ──────────────────────────────────────────────

type OfferDay = { id: string; dateKey: string; startTime: string | null; endTime: string | null; supervisorContractorId: string | null };

/** The saved days around `dateKey` with no sub running them yet, in a row (one visit), from today on. */
function visitAround(rows: OfferDay[], dateKey: string): OfferDay[] {
  const today = todayEasternKey();
  const open = rows.filter((r) => !r.supervisorContractorId && r.dateKey >= today).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  const i = open.findIndex((r) => r.dateKey === dateKey);
  if (i < 0) return [];
  const gap = (a: string, b: string) => (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / DAY_MS;
  let lo = i;
  let hi = i;
  while (lo > 0 && gap(open[lo - 1]!.dateKey, open[lo]!.dateKey) <= 1) lo--;
  while (hi < open.length - 1 && gap(open[hi]!.dateKey, open[hi + 1]!.dateKey) <= 1) hi++;
  return open.slice(lo, hi + 1);
}

async function ownerDays(kind: OfferKind, ownerId: string): Promise<OfferDay[]> {
  const select = { id: true, date: true, startTime: true, endTime: true, supervisorContractorId: true } as const;
  const rows =
    kind === "day"
      ? await prisma.projectDayAssignment.findMany({ where: { projectId: ownerId }, select })
      : await prisma.changeOrderDayAssignment.findMany({ where: { changeOrderId: ownerId }, select });
  return rows.map((r) => ({ id: r.id, dateKey: dayKey(r.date), startTime: r.startTime, endTime: r.endTime, supervisorContractorId: r.supervisorContractorId }));
}

/** For the day card: the days an offer from this day would cover. */
export async function offerableDays(kind: OfferKind, ownerId: string, dateKey: string): Promise<OfferDay[]> {
  return visitAround(await ownerDays(kind, ownerId), dateKey);
}

// ── What the job is, for the sub and for emails ───────────────────────────

type JobInfo = {
  projectId: string;
  title: string;
  segment: string;
  address: string | null;
  scope: string | null;
  dayNote: string | null;
  days: { id: string; dateKey: string; startTime: string | null; endTime: string | null; supervisorContractorId: string | null }[];
  url: string | undefined;
};

const PROJECT_INFO = {
  id: true,
  jobTitle: true,
  segment: true,
  building: { select: { address: true } },
  workOrderRecord: { select: { siteAddress: true } },
  turnoverRequest: { select: { otherDescription: true } },
} as const;

async function jobInfo(offer: { kind: string; projectId: string; changeOrderId: string | null; dayIds: string[] }): Promise<JobInfo | null> {
  const base = appUrl();
  if (offer.kind === "co-day") {
    if (!offer.changeOrderId) return null;
    const co = await prisma.projectChangeOrder.findUnique({ where: { id: offer.changeOrderId }, select: { id: true, title: true, project: { select: PROJECT_INFO } } });
    if (!co) return null;
    const days = await prisma.changeOrderDayAssignment.findMany({
      where: { id: { in: offer.dayIds } },
      orderBy: { date: "asc" },
      select: { id: true, date: true, startTime: true, endTime: true, supervisorContractorId: true, comment: true },
    });
    return {
      projectId: co.project.id,
      title: `${co.title} (${co.project.jobTitle})`,
      segment: co.project.segment,
      address: co.project.building?.address || co.project.workOrderRecord?.siteAddress || null,
      scope: null,
      dayNote: [...new Set(days.map((d) => d.comment?.trim()).filter(Boolean))].join("\n") || null,
      days: days.map((d) => ({ id: d.id, dateKey: dayKey(d.date), startTime: d.startTime, endTime: d.endTime, supervisorContractorId: d.supervisorContractorId })),
      url: base ? `${base}/erp/projects/${co.project.id}/change-orders/${co.id}` : undefined,
    };
  }
  const p = await prisma.project.findUnique({ where: { id: offer.projectId }, select: PROJECT_INFO });
  if (!p) return null;
  const days = await prisma.projectDayAssignment.findMany({
    where: { id: { in: offer.dayIds } },
    orderBy: { date: "asc" },
    select: { id: true, date: true, startTime: true, endTime: true, supervisorContractorId: true, comment: true, scopeItems: true, sovItems: { select: { description: true } } },
  });
  const label = (v: string) => turnoverScopeDisplayLabel(v, p.turnoverRequest?.otherDescription);
  const scopes = [...new Set(days.map((d) => scopeText(d.sovItems.map((s) => s.description), d.scopeItems.map(label))).filter(Boolean))];
  return {
    projectId: p.id,
    title: p.jobTitle,
    segment: p.segment,
    address: p.building?.address || p.workOrderRecord?.siteAddress || null,
    scope: scopes.join("; ") || null,
    dayNote: [...new Set(days.map((d) => d.comment?.trim()).filter(Boolean))].join("\n") || null,
    days: days.map((d) => ({ id: d.id, dateKey: dayKey(d.date), startTime: d.startTime, endTime: d.endTime, supervisorContractorId: d.supervisorContractorId })),
    url: base ? `${base}/erp/projects/${p.id}` : undefined,
  };
}

// ── Staff: send, resend, cancel ───────────────────────────────────────────

type SendInput = {
  kind: OfferKind;
  /** Project id for "day", change order id for "co-day" */
  ownerId: string;
  dateKey: string;
  contractorId: string;
  payCents: number | null;
  note: string | null;
  answerBy: Date;
  sentBy: string;
};

async function checkSub(contractorId: string): Promise<{ error: string } | { email: string; lang: Lang; name: string }> {
  const c = await prisma.contractor.findUnique({ where: { id: contractorId }, select: { name: true, email: true, status: true, language: true, portalTurnedOffAt: true } });
  if (!c) return { error: "Contractor not found" };
  if (c.status !== "ACTIVE") return { error: `${c.name} is inactive` };
  if (!c.email) return { error: `${c.name} has no email. Add one on their profile first.` };
  if (c.portalTurnedOffAt) return { error: `${c.name}'s page is turned off. Turn it back on in User Management first.` };
  return { email: c.email, lang: parseLang(c.language), name: c.name };
}

function checkAnswerBy(answerBy: Date, firstDay: string): string | null {
  if (Number.isNaN(answerBy.getTime())) return "Pick when they need to answer by";
  if (answerBy.getTime() < Date.now() + 15 * 60 * 1000) return "Give them at least 15 minutes to answer";
  if (dayKeyEastern(answerBy) > firstDay) return "The answer-by time has to be before the job starts";
  return null;
}

function dayKeyEastern(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

async function overlapsPending(kind: OfferKind, dayIds: string[], exceptGroup?: string): Promise<boolean> {
  const n = await prisma.subJobOffer.count({
    where: { kind, status: "PENDING", dayIds: { hasSome: dayIds }, ...(exceptGroup ? { groupId: { not: exceptGroup } } : {}) },
  });
  return n > 0;
}

export async function sendOffer(input: SendInput): Promise<{ id: string } | { error: string }> {
  const sub = await checkSub(input.contractorId);
  if ("error" in sub) return sub;
  const days = await offerableDays(input.kind, input.ownerId, input.dateKey);
  if (days.length === 0) return { error: "Save the day first. Days that already have a sub, or are in the past, can't be offered." };
  const answerError = checkAnswerBy(input.answerBy, days[0]!.dateKey);
  if (answerError) return { error: answerError };
  if (await overlapsPending(input.kind, days.map((d) => d.id))) return { error: "There's already an offer out for these days. Cancel it first." };

  let projectId = input.ownerId;
  let changeOrderId: string | null = null;
  if (input.kind === "co-day") {
    const co = await prisma.projectChangeOrder.findUnique({ where: { id: input.ownerId }, select: { projectId: true } });
    if (!co) return { error: "Change order not found" };
    projectId = co.projectId;
    changeOrderId = input.ownerId;
  }

  const id = crypto.randomUUID().replace(/-/g, "");
  const offer = await prisma.subJobOffer.create({
    data: {
      id,
      groupId: id,
      round: 1,
      contractorId: input.contractorId,
      kind: input.kind,
      projectId,
      changeOrderId,
      dayIds: days.map((d) => d.id),
      dateKeys: days.map((d) => d.dateKey),
      payCents: input.payCents,
      note: input.note,
      answerBy: input.answerBy,
      sentBy: input.sentBy,
    },
  });
  await emailOfferToSub(offer.id).catch((e) => console.error("Job offer email failed", { offerId: offer.id }, e));
  return { id: offer.id };
}

/** A new round of a declined or expired offer, usually at a new price. Same days, still open. */
export async function resendOffer(previousId: string, p: { payCents: number | null; note: string | null; answerBy: Date; sentBy: string }): Promise<{ id: string } | { error: string }> {
  const prev = await prisma.subJobOffer.findUnique({ where: { id: previousId } });
  if (!prev) return { error: "Offer not found" };
  if (prev.status !== "DECLINED" && prev.status !== "EXPIRED") return { error: "Only a declined or expired offer can be sent again" };
  const latest = await prisma.subJobOffer.findFirst({ where: { groupId: prev.groupId }, orderBy: { round: "desc" }, select: { id: true } });
  if (latest?.id !== prev.id) return { error: "A newer round of this offer already went out" };
  const sub = await checkSub(prev.contractorId);
  if ("error" in sub) return sub;

  const all = await ownerDays(prev.kind as OfferKind, prev.kind === "co-day" ? prev.changeOrderId! : prev.projectId);
  const today = todayEasternKey();
  const days = all.filter((d) => prev.dayIds.includes(d.id) && !d.supervisorContractorId && d.dateKey >= today).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  if (days.length === 0) return { error: "Those days are gone, passed, or already have a sub" };
  const answerError = checkAnswerBy(p.answerBy, days[0]!.dateKey);
  if (answerError) return { error: answerError };
  if (await overlapsPending(prev.kind as OfferKind, days.map((d) => d.id), prev.groupId)) return { error: "There's already another offer out for these days" };

  const offer = await prisma.subJobOffer.create({
    data: {
      groupId: prev.groupId,
      round: prev.round + 1,
      contractorId: prev.contractorId,
      kind: prev.kind,
      projectId: prev.projectId,
      changeOrderId: prev.changeOrderId,
      dayIds: days.map((d) => d.id),
      dateKeys: days.map((d) => d.dateKey),
      payCents: p.payCents,
      note: p.note,
      answerBy: p.answerBy,
      sentBy: p.sentBy,
    },
  });
  await emailOfferToSub(offer.id).catch((e) => console.error("Job offer email failed", { offerId: offer.id }, e));
  return { id: offer.id };
}

export async function cancelOffer(id: string, by: string, note: string | null): Promise<{ ok: true } | { error: string }> {
  const o = await prisma.subJobOffer.findUnique({ where: { id }, select: { status: true } });
  if (!o) return { error: "Offer not found" };
  if (o.status !== "PENDING") return { error: "Only an open offer can be cancelled" };
  await prisma.subJobOffer.update({ where: { id }, data: { status: "CANCELLED", cancelNote: note ? `${note} (${by})` : `Cancelled by ${by}`, answeredAt: new Date() } });
  return { ok: true };
}

export type DayOfferView = {
  id: string;
  groupId: string;
  round: number;
  status: OfferStatus;
  contractorId: string;
  contractorName: string;
  payCents: number | null;
  note: string | null;
  answerBy: string;
  dateKeys: string[];
  declineReason: string | null;
  declineNote: string | null;
  cancelNote: string | null;
  sentBy: string;
  createdAt: string;
  answeredAt: string | null;
  /** True for the newest round in its group */
  latest: boolean;
};

/** Every offer round touching this day row, newest first, for the day card. */
export async function offersForDay(kind: OfferKind, dayId: string): Promise<DayOfferView[]> {
  const touching = await prisma.subJobOffer.findMany({ where: { kind, dayIds: { has: dayId } }, select: { groupId: true } });
  if (touching.length === 0) return [];
  const rows = await prisma.subJobOffer.findMany({
    where: { groupId: { in: [...new Set(touching.map((t) => t.groupId))] } },
    orderBy: [{ createdAt: "desc" }],
    include: { contractor: { select: { name: true } } },
  });
  const newest = new Map<string, number>();
  for (const r of rows) newest.set(r.groupId, Math.max(newest.get(r.groupId) ?? 0, r.round));
  return rows.map((r) => ({
    id: r.id,
    groupId: r.groupId,
    round: r.round,
    status: r.status as OfferStatus,
    contractorId: r.contractorId,
    contractorName: r.contractor.name,
    payCents: r.payCents,
    note: r.note,
    answerBy: r.answerBy.toISOString(),
    dateKeys: r.dateKeys,
    declineReason: r.declineReason,
    declineNote: r.declineNote,
    cancelNote: r.cancelNote,
    sentBy: r.sentBy,
    createdAt: r.createdAt.toISOString(),
    answeredAt: r.answeredAt?.toISOString() ?? null,
    latest: newest.get(r.groupId) === r.round,
  }));
}

// ── The sub: see, accept, decline ─────────────────────────────────────────

export type PortalOffer = {
  id: string;
  title: string;
  address: string | null;
  scope: string | null;
  notes: string | null;
  payCents: number | null;
  answerBy: string;
  days: { dateKey: string; startTime: string | null; endTime: string | null }[];
};

/** Open offers for the sub's Offers tab. Turns any past their deadline into expired first. */
export async function portalOffers(contractorId: string): Promise<PortalOffer[]> {
  await expireOffers().catch((e) => console.error("Expiring offers failed", e));
  const offers = await prisma.subJobOffer.findMany({ where: { contractorId, status: "PENDING" }, orderBy: { answerBy: "asc" } });
  const out = await Promise.all(
    offers.map(async (o): Promise<PortalOffer | null> => {
      const info = await jobInfo(o);
      if (!info) return null;
      const notes = [o.note?.trim(), info.dayNote].filter(Boolean).join("\n") || null;
      return {
        id: o.id,
        title: info.title,
        address: info.address,
        scope: info.scope,
        notes,
        payCents: o.payCents,
        answerBy: o.answerBy.toISOString(),
        days: info.days.length
          ? info.days.map((d) => ({ dateKey: d.dateKey, startTime: d.startTime, endTime: d.endTime }))
          : o.dateKeys.map((k) => ({ dateKey: k, startTime: null, endTime: null })),
      };
    }),
  );
  return out.filter((o): o is PortalOffer => !!o);
}

/** Puts the sub on the offered days, like the day card does. */
async function book(offer: { id: string; kind: string; projectId: string; changeOrderId: string | null; contractorId: string; payCents: number | null }, info: JobInfo): Promise<void> {
  const cid = offer.contractorId;
  const ids = info.days.map((d) => d.id);
  const dates = info.days.map((d) => new Date(`${d.dateKey}T00:00:00.000Z`));
  const isCo = offer.kind === "co-day";

  if (isCo) {
    await prisma.changeOrderDayAssignment.updateMany({ where: { id: { in: ids } }, data: { supervisorContractorId: cid } });
    if (offer.payCents != null) await saveCoSubPay(offer.changeOrderId!, cid, offer.payCents, dates);
    await syncCoScheduleSubPay(offer.changeOrderId!);
  } else {
    await prisma.projectDayAssignment.updateMany({ where: { id: { in: ids } }, data: { supervisorContractorId: cid } });
    if (offer.payCents != null && hasCalendarSubPay(info.segment)) await saveSubPay(offer.projectId, cid, offer.payCents, dates);
    await syncScheduleSubPay(offer.projectId);
  }

  await batchDayInvites(async () => {
    await Promise.all(
      info.days.map((d) =>
        sendSubLeadInvite({
          kind: isCo ? "co-day" : "day",
          assignmentId: d.id,
          contractorId: cid,
          title: info.title,
          dateKey: d.dateKey,
          startTime: d.startTime,
          endTime: d.endTime,
          location: info.address ?? undefined,
          scopeText: info.scope,
          url: info.url,
        }),
      ),
    );
  });

  // They already said yes, so the invite's Confirm is answered for them
  const uids = info.days.map((d) => `${isCo ? "co-day" : "day"}-assignment-${d.id}-sub-${cid}@sueep.com`);
  const now = new Date();
  await prisma.scheduleConfirmation.updateMany({ where: { uid: { in: uids }, status: "PENDING" }, data: { status: "CONFIRMED", respondedAt: now } });
  const confirmed = await prisma.scheduleConfirmation.findMany({ where: { uid: { in: uids } }, select: { kind: true, assignmentId: true } });
  for (const c of confirmed) await notifyRequesterAfterConfirm(c);
}

export async function acceptOffer(contractorId: string, offerId: string, crewRaw: { count: unknown; names: unknown }, lang: Lang): Promise<{ ok: true } | { error: string }> {
  const crewCount = parseCrewCount(crewRaw.count);
  if (crewCount == null) return { error: tr(lang, { en: "Say how many people you're bringing", es: "Di cuántas personas vas a llevar" }) };
  const crewNames = parseCrewNames(crewRaw.names);
  const offer = await prisma.subJobOffer.findUnique({ where: { id: offerId } });
  if (!offer || offer.contractorId !== contractorId) return { error: tr(lang, { en: "This offer isn't available anymore.", es: "Esta oferta ya no está disponible." }) };
  if (offer.status !== "PENDING") return { error: tr(lang, { en: "This offer was already answered or closed.", es: "Esta oferta ya fue respondida o cerrada." }) };
  if (offer.answerBy < new Date()) {
    await expireOffers();
    return { error: tr(lang, { en: "The time to answer this offer has passed.", es: "Ya pasó el tiempo para responder esta oferta." }) };
  }
  // Claim it first, so a double tap can't book twice
  const claimed = await prisma.subJobOffer.updateMany({ where: { id: offerId, status: "PENDING" }, data: { status: "ACCEPTED", answeredAt: new Date() } });
  if (claimed.count === 0) return { error: tr(lang, { en: "This offer was already answered or closed.", es: "Esta oferta ya fue respondida o cerrada." }) };

  const info = await jobInfo(offer);
  const today = todayEasternKey();
  const problem = !info
    ? "the job was removed"
    : info.days.length !== offer.dayIds.length
      ? "some of the days were removed"
      : info.days.some((d) => d.supervisorContractorId && d.supervisorContractorId !== contractorId)
        ? "another sub was put on those days"
        : info.days.some((d) => d.dateKey < today)
          ? "the days already started"
          : null;
  if (problem || !info) {
    await prisma.subJobOffer.update({ where: { id: offerId }, data: { status: "CANCELLED", cancelNote: `Couldn't book on accept: ${problem}` } });
    await alertStaff(offerId, "UNBOOKABLE", problem ?? undefined).catch(() => {});
    return { error: tr(lang, { en: "This job changed since it was offered. Sueep will contact you.", es: "Este trabajo cambió desde que se ofreció. Sueep te contactará." }) };
  }

  try {
    await book(offer, info);
  } catch (e) {
    console.error("Booking an accepted offer failed", { offerId }, e);
    await prisma.subJobOffer.update({ where: { id: offerId }, data: { status: "PENDING", answeredAt: null } });
    return { error: tr(lang, { en: "Something went wrong. Try again.", es: "Algo salió mal. Intenta de nuevo." }) };
  }
  await setCrew(contractorId, info.days.map((d) => ({ kind: offer.kind as OfferKind, dayId: d.id })), crewCount, crewNames, { lang, alert: false, allowToday: true }).catch((e) =>
    console.error("Saving crew on accept failed", { offerId }, e),
  );
  await alertStaff(offerId, "ACCEPTED").catch((e) => console.error("Offer accepted alert failed", { offerId }, e));
  return { ok: true };
}

export async function declineOffer(contractorId: string, offerId: string, reason: unknown, noteRaw: unknown, lang: Lang): Promise<{ ok: true } | { error: string }> {
  if (!isDeclineReason(reason)) return { error: tr(lang, { en: "Pick a reason", es: "Elige una razón" }) };
  const note = typeof noteRaw === "string" && noteRaw.trim() ? noteRaw.trim().slice(0, 500) : null;
  if (reason === "OTHER" && !note) return { error: tr(lang, { en: "Tell us the reason", es: "Dinos la razón" }) };
  const done = await prisma.subJobOffer.updateMany({
    where: { id: offerId, contractorId, status: "PENDING" },
    data: { status: "DECLINED", declineReason: reason, declineNote: note, answeredAt: new Date() },
  });
  if (done.count === 0) return { error: tr(lang, { en: "This offer was already answered or closed.", es: "Esta oferta ya fue respondida o cerrada." }) };
  await alertStaff(offerId, "DECLINED").catch((e) => console.error("Offer declined alert failed", { offerId }, e));
  return { ok: true };
}

/** Open offers past their answer-by become expired, and the team is told. Hourly cron, and whenever a sub opens their offers. */
export async function expireOffers(): Promise<{ expired: number }> {
  const due = await prisma.subJobOffer.findMany({ where: { status: "PENDING", answerBy: { lt: new Date() } }, select: { id: true } });
  let expired = 0;
  for (const o of due) {
    const done = await prisma.subJobOffer.updateMany({ where: { id: o.id, status: "PENDING" }, data: { status: "EXPIRED", answeredAt: new Date() } });
    if (done.count === 0) continue;
    expired++;
    await alertStaff(o.id, "EXPIRED").catch((e) => console.error("Offer expired alert failed", { offerId: o.id }, e));
  }
  return { expired };
}

// ── Emails ────────────────────────────────────────────────────────────────

async function crewLine(dayIds: string[], kind: string): Promise<string> {
  const select = { subCrewCount: true, subCrewNames: true } as const;
  const d =
    kind === "co-day"
      ? await prisma.changeOrderDayAssignment.findFirst({ where: { id: { in: dayIds }, subCrewCount: { not: null } }, select })
      : await prisma.projectDayAssignment.findFirst({ where: { id: { in: dayIds }, subCrewCount: { not: null } }, select });
  if (!d?.subCrewCount) return "";
  return `<p><strong>Crew:</strong> ${d.subCrewCount} ${d.subCrewCount === 1 ? "person" : "people"}${d.subCrewNames.length ? ` (${escapeHtml(d.subCrewNames.join(", "))})` : ""}</p>`;
}

const BUTTON = "display:inline-block;padding:10px 18px;border-radius:6px;background:#E73C6E;color:#fff;text-decoration:none;font-weight:600";

async function emailOfferToSub(offerId: string): Promise<void> {
  const offer = await prisma.subJobOffer.findUnique({ where: { id: offerId }, include: { contractor: { select: { name: true, email: true, language: true } } } });
  if (!offer?.contractor.email) return;
  const info = await jobInfo(offer);
  if (!info) return;
  const lang = parseLang(offer.contractor.language);
  await ensurePortalToken(offer.contractorId, false);
  const button = await subEmailButtonUrl(offer.contractorId);
  const first = offer.contractor.name.split(" ")[0] || offer.contractor.name;
  const when = info.days.map((d) => `<li>${escapeHtml(formatInviteWhen(d.dateKey, d.startTime, d.endTime, lang))}</li>`).join("");
  const notes = [offer.note?.trim(), info.dayNote].filter(Boolean).join("\n");
  const again = offer.round > 1;
  const html = [
    `<h2 style="margin:0 0 12px;color:#E73C6E">${tr(lang, { en: again ? "Updated job offer" : "New job offer", es: again ? "Oferta de trabajo actualizada" : "Nueva oferta de trabajo" })}</h2>`,
    `<p>${tr(lang, { en: "Hi", es: "Hola" })} ${escapeHtml(first)},</p>`,
    `<p>${tr(lang, { en: "Sueep is offering you this job:", es: "Sueep te ofrece este trabajo:" })} <strong>${escapeHtml(info.title)}</strong></p>`,
    `<ul style="padding-left:18px">${when}</ul>`,
    info.address ? `<p><strong>${tr(lang, { en: "Address", es: "Dirección" })}:</strong> ${escapeHtml(info.address)}</p>` : "",
    info.scope ? `<p><strong>${tr(lang, { en: "Scope", es: "Trabajo" })}:</strong> ${escapeHtml(info.scope)}</p>` : "",
    offer.payCents != null
      ? `<p><strong>${tr(lang, { en: "Pay", es: "Pago" })}:</strong> ${centsToDollars(offer.payCents)}${info.days.length > 1 ? ` ${tr(lang, { en: "for the visit, not per day", es: "por la visita, no por día" })}` : ""}</p>`
      : "",
    notes ? `<p><strong>${tr(lang, { en: "Notes", es: "Notas" })}:</strong><br>${escapeHtml(notes).replace(/\n/g, "<br>")}</p>` : "",
    `<p><strong>${tr(lang, { en: "Answer by", es: "Responde antes de" })}:</strong> ${escapeHtml(answerByLabel(offer.answerBy, lang))}</p>`,
    button ? `<p style="margin:20px 0"><a href="${escapeHtml(button)}" style="${BUTTON}">${tr(lang, { en: "Accept or decline", es: "Aceptar o rechazar" })}</a></p>` : "",
    `<p style="font-size:12px;color:#555">${tr(lang, { en: "Please don't forward this email, since the button signs you in.", es: "No reenvíes este correo, porque el botón inicia tu sesión." })}</p>`,
  ].join("");
  await sendEmail({
    type: "SUB_JOB_OFFER",
    to: offer.contractor.email,
    replyTo: offer.sentBy,
    link: info.url ? new URL(info.url).pathname : undefined,
    subject: tr(lang, {
      en: `Job offer: ${info.title}, ${dateRangeLabel(offer.dateKeys, lang)}`,
      es: `Oferta de trabajo: ${info.title}, ${dateRangeLabel(offer.dateKeys, lang)}`,
    }),
    html,
    lang,
  });
}

async function alertStaff(offerId: string, what: "ACCEPTED" | "DECLINED" | "EXPIRED" | "UNBOOKABLE", problem?: string): Promise<void> {
  const offer = await prisma.subJobOffer.findUnique({ where: { id: offerId }, include: { contractor: { select: { name: true } } } });
  if (!offer) return;
  const info = await jobInfo(offer);
  const title = info?.title ?? "a job";
  const dates = dateRangeLabel(offer.dateKeys);
  const who = escapeHtml(offer.contractor.name);
  const job = info?.url ? `<a href="${escapeHtml(info.url)}">${escapeHtml(title)}</a>` : escapeHtml(title);
  const pay = offer.payCents != null ? ` at ${centsToDollars(offer.payCents)}` : "";
  const link = info?.url ? new URL(info.url).pathname : undefined;

  if (what === "ACCEPTED") {
    await sendEmail({
      type: "SUB_JOB_OFFER_ACCEPTED",
      to: offer.sentBy,
      link,
      subject: `Offer accepted: ${offer.contractor.name}, ${title}, ${dates}`,
      html: `<p><strong>${who}</strong> accepted ${job} for ${escapeHtml(dates)}${escapeHtml(pay)}. They're on the schedule for those days and got the invite.</p>${await crewLine(offer.dayIds, offer.kind)}`,
    });
    return;
  }
  const also = (await getNotificationSetting("SUB_JOB_OFFER_DECLINED")).to;
  const to = [offer.sentBy, ...also];
  const body =
    what === "DECLINED"
      ? `<p><strong>${who}</strong> declined ${job} for ${escapeHtml(dates)}${escapeHtml(pay)}.</p><p><strong>Reason:</strong> ${escapeHtml(declineReasonLabel(offer.declineReason))}${offer.declineNote ? `: ${escapeHtml(offer.declineNote)}` : ""}</p><p>${
          offer.declineReason === "PRICE" ? "Open the day on the Schedule to resend at a new price, or offer it to someone else." : "Open the day on the Schedule to offer it to someone else."
        }</p>`
      : what === "EXPIRED"
        ? `<p><strong>${who}</strong> didn't answer the offer for ${job} (${escapeHtml(dates)}) by ${escapeHtml(answerByLabel(offer.answerBy))}.</p><p>Open the day on the Schedule to send it again or offer it to someone else.</p>`
        : `<p><strong>${who}</strong> tried to accept ${job} (${escapeHtml(dates)}), but ${escapeHtml(problem ?? "the job changed")}. Nothing was booked. Let them know and book the day by hand.</p>`;
  await sendEmail({
    type: "SUB_JOB_OFFER_DECLINED",
    to,
    link,
    subject: `${what === "DECLINED" ? "Offer declined" : what === "EXPIRED" ? "No answer to offer" : "Offer accepted but not booked"}: ${offer.contractor.name}, ${title}, ${dates}`,
    html: body,
  });
}
