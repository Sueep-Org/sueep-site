/**
 * Sub portal check-in and check-out (SubCheckIn), from the Today tab of
 * /sub/[token]. Same idea as janitor clock-in (/clock/[token]):
 *
 * - The phone's location is taken only at the moment they tap, never all day.
 *   Denied or slow location still saves, shown as "no location".
 * - Farther from the job than the Settings distance (Subs tab) still saves,
 *   flagged Off site on the day card. The phone's own accuracy is allowed for.
 * - Checking in past the start time plus the grace window saves the minutes
 *   late. A sub running a day who hasn't checked in by then gets the
 *   "Sub hasn't checked in" email to the day's PM (cron, every 15 minutes),
 *   only for subs who use their portal, so the rest don't set off alerts.
 * - Subs running the day say how many people actually came, to compare with
 *   the crew they planned (subCrew.ts).
 *
 * The job site is the project's Building (its saved or hand-set location),
 * else the post-construction site address (GeocodeCache).
 */
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { escapeHtml, sendEmail } from "@/lib/email";
import { getNotificationSetting } from "@/lib/notificationSettings";
import { dayKey } from "@/lib/erp/schedule";
import { todayEasternKey } from "@/lib/erp/dates";
import { distanceMeters, easternDateKey, easternWallToInstant, formatMiles, isFarFromBuilding } from "@/lib/erp/janitorialHours";
import { coordinatesForAddress, ensureBuildingCoordinates } from "@/lib/erp/geocode";
import { appUrl } from "@/lib/erp/scheduleInvites";
import { loadSubPortalSettings, type SubPortalSettings } from "@/lib/erp/subPortalSettingsServer";
import { parseCrewCount } from "@/lib/erp/subCrew";
import { photoCountsFor, photoNeeds, photosShort, type PhotoCounts } from "@/lib/erp/subPhotoRules";
import type { PhotoKind } from "@/lib/erp/subPhotoAreas";
import { tr } from "@/lib/erp/language";
import type { LinkedSub } from "@/lib/erp/subPortalAccess";

/** A tap saved on the phone while offline is accepted this long after, with its own time. */
const QUEUED_TAP_HOURS = 2;
/** No missed check-in email once the start is this long past (a cron that didn't run shouldn't alert hours later). */
const MISSED_ALERT_WINDOW_HOURS = 3;

export type Position = { latitude: number; longitude: number; accuracy: number | null };

/** What the sub sees on their Today card */
export type TodayCheckIn = {
  checkInAt: string | null;
  checkOutAt: string | null;
  crewCount: number | null;
  photos: { id: string; kind: PhotoKind; area: string | null }[];
  /** Photos needed before check-out (0 for crew) */
  needs: PhotoCounts;
  /** Staff let them check out without the photos */
  waived: boolean;
  /** Turnover unit: photo areas are the checklist sections */
  turnover: boolean;
};

/** What staff see on the day card (lead sub only) */
export type DayCheckIn = {
  /** SubCheckIn id, for letting them check out without photos */
  id: string;
  projectId: string;
  photos: PhotoCounts;
  needs: PhotoCounts;
  /** Let check out without the photos: by whom and why */
  waived: { by: string | null; reason: string | null } | null;
  /** The PM's quality review, once they've checked out (subReviews.ts) */
  review: { id: string; status: "PENDING" | "NEEDS_FIX" | "PASSED"; round: number } | null;
  inAt: string | null;
  outAt: string | null;
  lateMinutes: number | null;
  inOffSite: boolean;
  outOffSite: boolean;
  /** "0.8 mi" when off site */
  inDistance: string | null;
  outDistance: string | null;
  /** Tapped without sharing a location */
  inNoLocation: boolean;
  outNoLocation: boolean;
  crewCount: number | null;
  /** When the PM was emailed they hadn't checked in */
  missedAlertAt: string | null;
};

export type CheckInErrorCode = "NOT_TODAY" | "ALREADY_IN" | "NOT_IN" | "ALREADY_OUT" | "CREW" | "PHOTOS" | "INVALID";

export type Site = { building: { id: string; latitude: number | null; longitude: number | null } | null; address: string | null };

export type JobDay = {
  jobKey: string;
  projectId: string;
  changeOrderId: string | null;
  role: "lead" | "crew";
  startTime: string | null;
  site: Site;
  /** A turnover unit (change order days go by their project) */
  turnover: boolean;
  /** The day's PM, who reviews it */
  pmUserId: string | null;
  /** Leads: the crew they said they'd bring, while it's still theirs */
  plannedCrew: number | null;
};

/** Turnover units, same check as isTurnoverProject */
const TURNOVER_SEGMENT = "JANITORIAL_TURNOVER_REQUESTS";

const PROJECT_SITE = {
  segment: true,
  building: { select: { id: true, latitude: true, longitude: true } },
  workOrderRecord: { select: { siteAddress: true } },
} as const;

function siteOf(p: { building: Site["building"]; workOrderRecord: { siteAddress: string | null } | null }): Site {
  return { building: p.building, address: p.building ? null : p.workOrderRecord?.siteAddress?.trim() || null };
}

export function utcDay(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

export function jobKeyOf(projectId: string, changeOrderId: string | null): string {
  return changeOrderId ? `co:${changeOrderId}` : `p:${projectId}`;
}

/** This sub's place on a job that day: running it, or on its crew. Null when they aren't on it. */
export async function findJobDay(contractorId: string, jobKey: string, dateKey: string): Promise<JobDay | null> {
  const date = utcDay(dateKey);
  const [kind, id] = jobKey.split(":");
  if (!id) return null;

  if (kind === "p") {
    const day = await prisma.projectDayAssignment.findUnique({
      where: { projectId_date: { projectId: id, date } },
      select: { supervisorContractorId: true, startTime: true, projectManagerUserId: true, subCrewCount: true, subCrewContractorId: true },
    });
    const lead = day?.supervisorContractorId === contractorId;
    const crew = lead
      ? null
      : await prisma.projectWorkerDayAssignment.findUnique({ where: { projectId_contractorId_date: { projectId: id, contractorId, date } }, select: { id: true } });
    if (!lead && !crew) return null;
    const project = await prisma.project.findUnique({ where: { id }, select: PROJECT_SITE });
    if (!project) return null;
    return {
      jobKey,
      projectId: id,
      changeOrderId: null,
      role: lead ? "lead" : "crew",
      startTime: day?.startTime ?? null,
      site: siteOf(project),
      turnover: project.segment === TURNOVER_SEGMENT,
      pmUserId: day?.projectManagerUserId ?? null,
      plannedCrew: lead && day?.subCrewContractorId === contractorId ? (day.subCrewCount ?? null) : null,
    };
  }

  if (kind === "co") {
    const day = await prisma.changeOrderDayAssignment.findUnique({
      where: { changeOrderId_date: { changeOrderId: id, date } },
      select: { supervisorContractorId: true, startTime: true, projectManagerUserId: true, subCrewCount: true, subCrewContractorId: true },
    });
    const lead = day?.supervisorContractorId === contractorId;
    const crew = lead
      ? null
      : await prisma.changeOrderWorkerDayAssignment.findUnique({ where: { changeOrderId_contractorId_date: { changeOrderId: id, contractorId, date } }, select: { id: true } });
    if (!lead && !crew) return null;
    const co = await prisma.projectChangeOrder.findUnique({ where: { id }, select: { projectId: true, project: { select: PROJECT_SITE } } });
    if (!co) return null;
    return {
      jobKey,
      projectId: co.projectId,
      changeOrderId: id,
      role: lead ? "lead" : "crew",
      startTime: day?.startTime ?? null,
      site: siteOf(co.project),
      turnover: co.project.segment === TURNOVER_SEGMENT,
      pmUserId: day?.projectManagerUserId ?? null,
      plannedCrew: lead && day?.subCrewContractorId === contractorId ? (day.subCrewCount ?? null) : null,
    };
  }
  return null;
}

/** The job site's coordinates. lookUp false reads only what's saved, so a check-in never waits on the geocoder. */
export async function siteCoordinates(site: Site, lookUp: boolean): Promise<{ latitude: number; longitude: number } | null> {
  if (site.building) {
    if (site.building.latitude != null && site.building.longitude != null) return { latitude: site.building.latitude, longitude: site.building.longitude };
    return lookUp ? ensureBuildingCoordinates(site.building.id) : null;
  }
  return site.address ? coordinatesForAddress(site.address, { lookUp }) : null;
}

export function measure(pos: Position, siteAt: { latitude: number; longitude: number }, farMeters: number): { meters: number; offSite: boolean } {
  const meters = distanceMeters(pos, siteAt);
  return { meters, offSite: isFarFromBuilding(meters, pos.accuracy, farMeters) };
}

/** The time they tapped: a queued tap keeps its own time if recent, else now. */
export function tapTime(raw: unknown, now: Date): Date {
  const t = typeof raw === "string" ? new Date(raw) : null;
  if (!t || isNaN(t.getTime())) return now;
  if (t.getTime() > now.getTime()) return now;
  if (now.getTime() - t.getTime() > QUEUED_TAP_HOURS * 3_600_000) return now;
  return t;
}

export function parsePosition(body: Record<string, unknown>): Position | null {
  const coord = (v: unknown, limit: number) => {
    const n = typeof v === "number" ? v : Number(v);
    return v != null && v !== "" && Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
  };
  const latitude = coord(body.latitude, 90);
  const longitude = coord(body.longitude, 180);
  if (latitude == null || longitude == null) return null;
  return { latitude, longitude, accuracy: coord(body.accuracy, 1_000_000) };
}

/** Looks the site up after the response is sent, then fills in how far they were. */
function measureLater(rowId: string, which: "in" | "out", pos: Position, site: Site) {
  after(async () => {
    try {
      const at = await siteCoordinates(site, true);
      if (!at) return;
      const m = measure(pos, at, (await loadSubPortalSettings()).checkInFarMeters);
      await prisma.subCheckIn.update({
        where: { id: rowId },
        data: which === "in" ? { inMeters: m.meters, inOffSite: m.offSite } : { outMeters: m.meters, outOffSite: m.offSite },
      });
    } catch (e) {
      console.error("Sub check-in distance failed", { rowId }, e);
    }
  });
}

/**
 * Saves a check-in or check-out. Errors carry a code so a phone retrying a
 * queued tap knows "already done" from a real problem.
 */
export async function recordCheckIn(
  sub: LinkedSub,
  input: { action: "in" | "out"; jobKey: string; position: Position | null; crewCount: unknown; tappedAt: unknown },
): Promise<{ ok: true } | { error: string; code: CheckInErrorCode }> {
  const lang = sub.lang;
  const at = tapTime(input.tappedAt, new Date());
  const dateKey = easternDateKey(at);
  const date = utcDay(dateKey);
  const where = { contractorId_jobKey_date: { contractorId: sub.id, jobKey: input.jobKey, date } };
  const settings = await loadSubPortalSettings();

  const job = await findJobDay(sub.id, input.jobKey, dateKey);
  if (!job) return { code: "NOT_TODAY", error: tr(lang, { en: "This job isn't on your schedule today.", es: "Este trabajo no está en tu horario de hoy." }) };
  const siteAt = input.position ? await siteCoordinates(job.site, false) : null;
  const m = input.position && siteAt ? measure(input.position, siteAt, settings.checkInFarMeters) : null;
  const existing = await prisma.subCheckIn.findUnique({ where });

  if (input.action === "in") {
    if (existing?.checkInAt) return { code: "ALREADY_IN", error: tr(lang, { en: "You already checked in.", es: "Ya registraste tu entrada." }) };
    const crewCount = job.role === "lead" ? parseCrewCount(input.crewCount) : null;
    if (job.role === "lead" && crewCount == null) {
      return { code: "CREW", error: tr(lang, { en: "Enter how many people came, 1 to 50", es: "Escribe cuántas personas vinieron, de 1 a 50" }) };
    }
    let lateMinutes: number | null = null;
    if (job.startTime) {
      const late = Math.floor((at.getTime() - easternWallToInstant(dateKey, job.startTime).getTime()) / 60_000);
      if (late > settings.checkInGraceMinutes) lateMinutes = late;
    }
    const data = {
      role: job.role,
      checkInAt: at,
      inLatitude: input.position?.latitude ?? null,
      inLongitude: input.position?.longitude ?? null,
      inAccuracy: input.position?.accuracy ?? null,
      inMeters: m?.meters ?? null,
      inOffSite: m?.offSite ?? false,
      lateMinutes,
      crewCount,
      startTime: job.startTime,
      plannedCrew: job.plannedCrew,
    };
    const row = await prisma.subCheckIn.upsert({
      where,
      create: { contractorId: sub.id, jobKey: job.jobKey, projectId: job.projectId, changeOrderId: job.changeOrderId, date, ...data },
      update: data,
    });
    if (input.position && !siteAt) measureLater(row.id, "in", input.position, job.site);
    return { ok: true };
  }

  if (!existing?.checkInAt) return { code: "NOT_IN", error: tr(lang, { en: "Check in first.", es: "Primero registra tu entrada." }) };
  if (existing.checkOutAt) return { code: "ALREADY_OUT", error: tr(lang, { en: "You already checked out.", es: "Ya registraste tu salida." }) };
  if (!existing.photosWaivedAt) {
    const short = photosShort((await photoCountsFor([existing.id])).get(existing.id) ?? { before: 0, after: 0 }, photoNeeds(job.role, job.turnover, settings));
    if (short.before + short.after > 0) {
      const parts = [
        short.before ? tr(lang, { en: `${short.before} more before`, es: `${short.before} más de antes` }) : "",
        short.after ? tr(lang, { en: `${short.after} more after`, es: `${short.after} más de después` }) : "",
      ].filter(Boolean);
      return {
        code: "PHOTOS",
        error: tr(lang, {
          en: `Add ${parts.join(" and ")} ${short.before + short.after === 1 ? "photo" : "photos"} to check out.`,
          es: `Agrega ${parts.join(" y ")} ${short.before + short.after === 1 ? "foto" : "fotos"} para registrar tu salida.`,
        }),
      };
    }
  }
  const outAt = at < existing.checkInAt ? existing.checkInAt : at;
  await prisma.subCheckIn.update({
    where: { id: existing.id },
    data: {
      checkOutAt: outAt,
      outLatitude: input.position?.latitude ?? null,
      outLongitude: input.position?.longitude ?? null,
      outAccuracy: input.position?.accuracy ?? null,
      outMeters: m?.meters ?? null,
      outOffSite: m?.offSite ?? false,
    },
  });
  if (input.position && !siteAt) measureLater(existing.id, "out", input.position, job.site);
  if (job.role === "lead") {
    // Loaded here, not at the top: subReviews -> subPhotos -> this file
    const { openReviewOnCheckOut } = await import("@/lib/erp/subReviews");
    await openReviewOnCheckOut(existing.id, job.pmUserId);
  }
  return { ok: true };
}

/** The sub's check-ins today, by job key, for their Today tab. */
export async function loadTodayCheckIns(contractorId: string, todayKey: string): Promise<Record<string, TodayCheckIn>> {
  const [rows, settings] = await Promise.all([
    prisma.subCheckIn.findMany({
      where: { contractorId, date: utcDay(todayKey), checkInAt: { not: null } },
      select: {
        jobKey: true,
        role: true,
        checkInAt: true,
        checkOutAt: true,
        crewCount: true,
        photosWaivedAt: true,
        project: { select: { segment: true } },
        photos: { where: { kind: { in: ["before", "after"] } }, orderBy: { takenAt: "asc" }, select: { id: true, kind: true, area: true } },
      },
    }),
    loadSubPortalSettings(),
  ]);
  return Object.fromEntries(
    rows.map((r): [string, TodayCheckIn] => {
      const turnover = r.project.segment === TURNOVER_SEGMENT;
      return [
        r.jobKey,
        {
          checkInAt: r.checkInAt?.toISOString() ?? null,
          checkOutAt: r.checkOutAt?.toISOString() ?? null,
          crewCount: r.crewCount,
          photos: r.photos.map((p) => ({ id: p.id, kind: p.kind as PhotoKind, area: p.area })),
          needs: photoNeeds(r.role, turnover, settings),
          waived: !!r.photosWaivedAt,
          turnover,
        },
      ];
    }),
  );
}

type CheckInRow = {
  id: string;
  projectId: string;
  role: string;
  project: { segment: string };
  photosWaivedAt: Date | null;
  photosWaivedBy: string | null;
  photosWaivedReason: string | null;
  review: { id: string; status: string; round: number } | null;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  lateMinutes: number | null;
  inOffSite: boolean;
  outOffSite: boolean;
  inMeters: number | null;
  outMeters: number | null;
  inLatitude: number | null;
  outLatitude: number | null;
  crewCount: number | null;
  missedAlertAt: Date | null;
};

function dayView(r: CheckInRow, photos: PhotoCounts, settings: SubPortalSettings): DayCheckIn {
  return {
    id: r.id,
    projectId: r.projectId,
    photos,
    needs: photoNeeds(r.role, r.project.segment === TURNOVER_SEGMENT, settings),
    waived: r.photosWaivedAt ? { by: r.photosWaivedBy, reason: r.photosWaivedReason } : null,
    review: r.review ? { id: r.review.id, status: r.review.status as "PENDING" | "NEEDS_FIX" | "PASSED", round: r.review.round } : null,
    inAt: r.checkInAt?.toISOString() ?? null,
    outAt: r.checkOutAt?.toISOString() ?? null,
    lateMinutes: r.lateMinutes,
    inOffSite: r.inOffSite,
    outOffSite: r.outOffSite,
    inDistance: r.inOffSite && r.inMeters != null ? formatMiles(r.inMeters) : null,
    outDistance: r.outOffSite && r.outMeters != null ? formatMiles(r.outMeters) : null,
    inNoLocation: !!r.checkInAt && r.inLatitude == null,
    outNoLocation: !!r.checkOutAt && r.outLatitude == null,
    crewCount: r.crewCount,
    missedAlertAt: r.missedAlertAt?.toISOString() ?? null,
  };
}

/**
 * Lead subs' check-ins for the schedule's day cards, keyed
 * "<jobKey>|<YYYY-MM-DD>|<contractorId>". Look up with dayCheckInKey.
 */
export async function loadDayCheckIns(): Promise<Map<string, DayCheckIn>> {
  const rows = await prisma.subCheckIn.findMany({
    where: { role: "lead" },
    select: {
      id: true,
      projectId: true,
      role: true,
      project: { select: { segment: true } },
      photosWaivedAt: true,
      photosWaivedBy: true,
      photosWaivedReason: true,
      review: { select: { id: true, status: true, round: true } },
      jobKey: true,
      date: true,
      contractorId: true,
      checkInAt: true,
      checkOutAt: true,
      lateMinutes: true,
      inOffSite: true,
      outOffSite: true,
      inMeters: true,
      outMeters: true,
      inLatitude: true,
      outLatitude: true,
      crewCount: true,
      missedAlertAt: true,
    },
  });
  const [counts, settings] = await Promise.all([photoCountsFor(rows.map((r) => r.id)), loadSubPortalSettings()]);
  return new Map(rows.map((r) => [dayCheckInKey(r.jobKey, dayKey(r.date), r.contractorId), dayView(r, counts.get(r.id) ?? { before: 0, after: 0 }, settings)]));
}

export function dayCheckInKey(jobKey: string, dateKey: string, contractorId: string): string {
  return `${jobKey}|${dateKey}|${contractorId}`;
}

// ── Missed check-in alert (cron) ───────────────────────────────────────────

function timeText(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return new Date(Date.UTC(2000, 0, 1, h ?? 0, m ?? 0)).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}

/**
 * Every 15 minutes (vercel.json): subs running a day today who haven't
 * checked in by the start time plus grace. Each day alerts once.
 */
export async function alertMissedCheckIns(now: Date = new Date()): Promise<{ alerted: number }> {
  const todayKey = todayEasternKey(now);
  const date = utcDay(todayKey);
  const { checkInGraceMinutes } = await loadSubPortalSettings();

  // Only subs who use their portal: signed in on a phone and link still on
  const portalSubs = await prisma.contractor.findMany({
    where: { status: "ACTIVE", portalTurnedOffAt: null, portalToken: { not: null }, portalDevices: { some: {} } },
    select: { id: true, name: true, phone: true },
  });
  if (portalSubs.length === 0) return { alerted: 0 };
  const subOf = new Map(portalSubs.map((s) => [s.id, s]));
  const ids = [...subOf.keys()];

  const [days, coDays] = await Promise.all([
    prisma.projectDayAssignment.findMany({
      where: { date, supervisorContractorId: { in: ids }, startTime: { not: null } },
      select: { projectId: true, supervisorContractorId: true, startTime: true, projectManager: { select: { email: true } }, project: { select: { jobTitle: true } } },
    }),
    prisma.changeOrderDayAssignment.findMany({
      where: { date, supervisorContractorId: { in: ids }, startTime: { not: null } },
      select: {
        changeOrderId: true,
        supervisorContractorId: true,
        startTime: true,
        projectManager: { select: { email: true } },
        changeOrder: { select: { title: true, projectId: true, project: { select: { jobTitle: true } } } },
      },
    }),
  ]);

  type Due = { contractorId: string; jobKey: string; projectId: string; changeOrderId: string | null; startTime: string; title: string; path: string; pm: string | null };
  const due: Due[] = [
    ...days.map((d) => ({
      contractorId: d.supervisorContractorId!,
      jobKey: jobKeyOf(d.projectId, null),
      projectId: d.projectId,
      changeOrderId: null,
      startTime: d.startTime!,
      title: d.project.jobTitle,
      path: `/erp/projects/${d.projectId}`,
      pm: d.projectManager?.email ?? null,
    })),
    ...coDays.map((d) => ({
      contractorId: d.supervisorContractorId!,
      jobKey: jobKeyOf(d.changeOrder.projectId, d.changeOrderId),
      projectId: d.changeOrder.projectId,
      changeOrderId: d.changeOrderId,
      startTime: d.startTime!,
      title: `${d.changeOrder.title} (${d.changeOrder.project.jobTitle})`,
      path: `/erp/projects/${d.changeOrder.projectId}/change-orders/${d.changeOrderId}`,
      pm: d.projectManager?.email ?? null,
    })),
  ].filter((d) => {
    const deadline = easternWallToInstant(todayKey, d.startTime).getTime() + checkInGraceMinutes * 60_000;
    return now.getTime() > deadline && now.getTime() - deadline < MISSED_ALERT_WINDOW_HOURS * 3_600_000;
  });
  if (due.length === 0) return { alerted: 0 };

  const existing = await prisma.subCheckIn.findMany({
    where: { date, contractorId: { in: [...new Set(due.map((d) => d.contractorId))] } },
    select: { contractorId: true, jobKey: true, checkInAt: true, missedAlertAt: true },
  });
  const done = new Set(existing.filter((e) => e.checkInAt || e.missedAlertAt).map((e) => `${e.contractorId}|${e.jobKey}`));

  let alerted = 0;
  for (const d of due) {
    if (done.has(`${d.contractorId}|${d.jobKey}`)) continue;
    // Claim the alert first, so two runs can't both send it
    const row = await prisma.subCheckIn.upsert({
      where: { contractorId_jobKey_date: { contractorId: d.contractorId, jobKey: d.jobKey, date } },
      create: { contractorId: d.contractorId, jobKey: d.jobKey, projectId: d.projectId, changeOrderId: d.changeOrderId, date, role: "lead", startTime: d.startTime },
      update: {},
      select: { id: true },
    });
    const claimed = await prisma.subCheckIn.updateMany({ where: { id: row.id, checkInAt: null, missedAlertAt: null }, data: { missedAlertAt: now } });
    if (claimed.count === 0) continue;
    alerted++;
    const sub = subOf.get(d.contractorId)!;
    await emailMissed({ ...d, subName: sub.name, phone: sub.phone, minutesLate: Math.floor((now.getTime() - easternWallToInstant(todayKey, d.startTime).getTime()) / 60_000) }).catch((e) =>
      console.error("Missed check-in alert failed", { contractorId: d.contractorId, jobKey: d.jobKey }, e),
    );
  }
  return { alerted };
}

async function emailMissed(p: { subName: string; phone: string | null; title: string; path: string; pm: string | null; startTime: string; minutesLate: number }): Promise<void> {
  const also = (await getNotificationSetting("SUB_CHECK_IN_MISSED")).to;
  const base = appUrl();
  const job = base ? `<a href="${escapeHtml(`${base}${p.path}`)}">${escapeHtml(p.title)}</a>` : escapeHtml(p.title);
  const phone = p.phone?.trim() ? `<p>Their phone: <a href="tel:${escapeHtml(p.phone.trim())}">${escapeHtml(p.phone.trim())}</a></p>` : "";
  await sendEmail({
    type: "SUB_CHECK_IN_MISSED",
    to: [...new Set([...(p.pm ? [p.pm] : []), ...also])],
    link: p.path,
    subject: `Not checked in: ${p.subName}, ${p.title}`,
    html: `<p><strong>${escapeHtml(p.subName)}</strong> hasn't checked in for ${job} today. The day starts at ${escapeHtml(timeText(p.startTime))}, ${p.minutesLate} minutes ago.</p>${phone}<p>They may have just forgotten to tap Check in on their jobs page. If they check in later, the day card shows it.</p>`,
  });
}
