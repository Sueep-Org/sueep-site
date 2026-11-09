/**
 * Quality review of a sub's day (SubReview), from their before/after photos:
 *
 * - When the sub running a day checks out, a review opens for the day's PM
 *   (SUB_REVIEW_READY email). Business Managers and Admins can review any
 *   day; other PMs only their own days, or days with no PM. Supervisors never.
 * - Pass closes it. Needs fix sends the sub what to fix (turnovers pick
 *   checklist sections, other jobs type lines), a note and optional photos,
 *   in their portal and by email (SUB_FIX_REQUESTED). They take fix photos
 *   and send them back, which opens the next round for review. Repeats until Pass.
 * - "Checked on site" also saves a QualityCheck on the project.
 * - Settings, Subs "Quality check must pass before billing" (off by default)
 *   stops a job being marked Billed while one of its reviews isn't passed.
 *
 * Server only.
 */
import { prisma } from "@/lib/prisma";
import { escapeHtml, sendEmail } from "@/lib/email";
import { getNotificationSetting } from "@/lib/notificationSettings";
import { appUrl } from "@/lib/erp/scheduleInvites";
import { ensurePortalToken, subEmailButtonUrl, type LinkedSub } from "@/lib/erp/subPortalAccess";
import { loadSubPortalSettings } from "@/lib/erp/subPortalSettingsServer";
import { namesByEmail } from "@/lib/erp/janitorialQualityChecks";
import { MAX_PHOTO_UPLOAD_BYTES, processPhoto, type PhotoErrorCode } from "@/lib/erp/subPhotos";
import { TURNOVER_PHOTO_AREAS, photoAreaLabel } from "@/lib/erp/subPhotoAreas";
import { parseLang, tr, type Lang } from "@/lib/erp/language";
import { isPmLevel } from "@/lib/erpRoles";
import type { ErpRole } from "@/lib/erpSession";

export type ReviewStatus = "PENDING" | "NEEDS_FIX" | "PASSED";

const TURNOVER_SEGMENT = "JANITORIAL_TURNOVER_REQUESTS";
const MAX_FIX_ITEMS = 15;
const MAX_ITEM_LENGTH = 120;
const MAX_NOTE = 1000;
/** Fix and issue photos per round */
const MAX_ROUND_PHOTOS = 20;
const BUTTON = "display:inline-block;padding:10px 18px;border-radius:6px;background:#E73C6E;color:#fff;text-decoration:none;font-weight:600";

type Reviewer = { uid: string; email: string; role: ErpRole | string };

/** PM, Business Manager or Admin; a PM only for their own days (or days with no PM). */
export function canReview(who: Reviewer, review: { pmUserId: string | null }): boolean {
  if (!isPmLevel(who.role)) return false;
  if (who.role === "PROJECT_MANAGER") return !review.pmUserId || review.pmUserId === who.uid;
  return true;
}

function dayLabel(d: Date, lang: Lang = "en"): string {
  return d.toLocaleDateString(lang === "es" ? "es-US" : "en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

async function jobTitle(projectId: string, changeOrderId: string | null): Promise<{ title: string; turnover: boolean }> {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { jobTitle: true, segment: true } });
  const co = changeOrderId ? await prisma.projectChangeOrder.findUnique({ where: { id: changeOrderId }, select: { title: true } }) : null;
  return { title: co ? `${co.title} (${p?.jobTitle ?? ""})` : (p?.jobTitle ?? "a job"), turnover: p?.segment === TURNOVER_SEGMENT };
}

/** Readable fix items: checklist section names on turnovers, the typed text otherwise */
export function fixItemLabels(items: string[]): string[] {
  return items.map((i) => photoAreaLabel(i) ?? i);
}

/** Cleans what the reviewer picked or typed */
export function parseFixItems(v: unknown, turnover: boolean): string[] {
  const raw = Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split("\n") : [];
  const clean = raw.map((s) => s.trim().replace(/\s+/g, " ").slice(0, MAX_ITEM_LENGTH)).filter(Boolean);
  const allowed = new Set(TURNOVER_PHOTO_AREAS.map((a) => a.id));
  return [...new Set(turnover ? clean.filter((i) => allowed.has(i)) : clean)].slice(0, MAX_FIX_ITEMS);
}

// ── Opening a review (at check-out) ────────────────────────────────────────

/** Called when the sub running a day checks out. Never throws. */
export async function openReviewOnCheckOut(checkInId: string, pmUserId: string | null): Promise<void> {
  try {
    const ci = await prisma.subCheckIn.findUnique({
      where: { id: checkInId },
      select: { contractorId: true, projectId: true, changeOrderId: true, date: true, role: true, review: { select: { id: true } }, contractor: { select: { name: true } } },
    });
    if (!ci || ci.role !== "lead" || ci.review) return;
    const review = await prisma.subReview.create({
      data: {
        checkInId,
        contractorId: ci.contractorId,
        projectId: ci.projectId,
        changeOrderId: ci.changeOrderId,
        date: ci.date,
        pmUserId,
        events: { create: { round: 1, action: "SUBMITTED", by: "sub" } },
      },
      select: { id: true },
    });
    await emailStaffReady(review.id, false);
  } catch (e) {
    console.error("Open sub review failed", { checkInId }, e);
  }
}

async function emailStaffReady(reviewId: string, fixesSent: boolean): Promise<void> {
  const r = await prisma.subReview.findUnique({ where: { id: reviewId }, select: { projectId: true, changeOrderId: true, date: true, round: true, pmUserId: true, contractor: { select: { name: true } } } });
  if (!r) return;
  const [{ title }, pm, also] = await Promise.all([
    jobTitle(r.projectId, r.changeOrderId),
    r.pmUserId ? prisma.erpUser.findUnique({ where: { id: r.pmUserId }, select: { email: true } }) : null,
    getNotificationSetting("SUB_REVIEW_READY").then((s) => s.to),
  ]);
  const path = `/erp/sub-reviews/${reviewId}`;
  const base = appUrl();
  const link = base ? `<p style="margin:20px 0"><a href="${escapeHtml(`${base}${path}`)}" style="${BUTTON}">Review it</a></p>` : "";
  const what = fixesSent
    ? `sent fix photos for ${escapeHtml(title)} (${escapeHtml(dayLabel(r.date))}). This is round ${r.round}.`
    : `checked out of ${escapeHtml(title)} (${escapeHtml(dayLabel(r.date))}). Their before and after photos are ready to look over.`;
  await sendEmail({
    type: "SUB_REVIEW_READY",
    to: [...new Set([...(pm?.email ? [pm.email] : []), ...also])],
    link: path,
    subject: `${fixesSent ? "Fixes ready for review" : "Ready for review"}: ${r.contractor.name}, ${title}, ${dayLabel(r.date)}`,
    html: `<p><strong>${escapeHtml(r.contractor.name)}</strong> ${what}</p><p>Pass it, or ask for fixes.</p>${link}`,
  });
}

// ── Staff decisions ────────────────────────────────────────────────────────

type DecisionResult = { ok: true } | { error: string; status: number };

async function reviewFor(id: string, who: Reviewer) {
  const r = await prisma.subReview.findUnique({
    where: { id },
    select: { id: true, status: true, round: true, pmUserId: true, projectId: true, changeOrderId: true, checkInId: true, contractorId: true, date: true, contractor: { select: { name: true } } },
  });
  if (!r) return { fail: { error: "Not found", status: 404 } };
  if (!canReview(who, r)) return { fail: { error: "Only this day's PM, a Business Manager or an Admin can review it.", status: 403 } };
  if (r.status !== "PENDING") return { fail: { error: r.status === "PASSED" ? "It already passed." : "It's waiting on the sub's fixes.", status: 409 } };
  return { review: r };
}

/** Saves the on-site check as a QualityCheck on the project. */
async function saveOnSiteCheck(r: { projectId: string; contractor: { name: string }; date: Date }, who: Reviewer, passed: boolean, note: string | null): Promise<string> {
  const name = (await namesByEmail([who.email])).get(who.email.toLowerCase()) ?? who.email;
  const qc = await prisma.qualityCheck.create({
    data: {
      projectId: r.projectId,
      supervisorName: name,
      pmApproval: passed,
      notes: [passed ? "Passed on site." : "Needs fixes, checked on site.", note].filter(Boolean).join(" "),
      scopeDescription: `Sub work: ${r.contractor.name}, ${dayLabel(r.date)}`,
    },
    select: { id: true },
  });
  return qc.id;
}

export async function passReview(id: string, who: Reviewer, input: { note: string | null; onSite: boolean }): Promise<DecisionResult> {
  const found = await reviewFor(id, who);
  if (!found.review) return found.fail;
  const r = found.review;
  const note = input.note?.trim().slice(0, MAX_NOTE) || null;
  const qualityCheckId = input.onSite ? await saveOnSiteCheck(r, who, true, note) : undefined;
  const done = await prisma.subReview.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "PASSED", passedAt: new Date(), passedBy: who.email, fixItems: [], fixNote: null, ...(qualityCheckId ? { qualityCheckId } : {}) },
  });
  if (done.count === 0) return { error: "Someone else just reviewed it. Refresh.", status: 409 };
  await prisma.subReviewEvent.create({ data: { reviewId: id, round: r.round, action: "PASSED", by: who.email, note, onSite: input.onSite } });
  return { ok: true };
}

export async function requestFix(
  id: string,
  who: Reviewer,
  input: { items: unknown; note: unknown; onSite: boolean; photos: Buffer[] },
): Promise<DecisionResult> {
  const found = await reviewFor(id, who);
  if (!found.review) return found.fail;
  const r = found.review;
  const { turnover } = await jobTitle(r.projectId, r.changeOrderId);
  const items = parseFixItems(input.items, turnover);
  const note = typeof input.note === "string" ? input.note.trim().slice(0, MAX_NOTE) : "";
  if (!note) return { error: "Say what needs fixing in the note.", status: 400 };
  if (input.photos.length > MAX_ROUND_PHOTOS) return { error: `Up to ${MAX_ROUND_PHOTOS} photos.`, status: 400 };
  if (input.photos.some((p) => p.length > MAX_PHOTO_UPLOAD_BYTES)) return { error: "A photo is too big.", status: 413 };

  let processed;
  try {
    processed = await Promise.all(input.photos.map((b) => processPhoto(b)));
  } catch {
    return { error: "One of the photos couldn't be read.", status: 415 };
  }
  const qualityCheckId = input.onSite ? await saveOnSiteCheck(r, who, false, note) : undefined;
  const done = await prisma.subReview.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "NEEDS_FIX", fixItems: items, fixNote: note, ...(qualityCheckId ? { qualityCheckId } : {}) },
  });
  if (done.count === 0) return { error: "Someone else just reviewed it. Refresh.", status: 409 };
  const now = new Date();
  for (const img of processed) {
    await prisma.subJobPhoto.create({
      data: {
        checkInId: r.checkInId,
        contractorId: r.contractorId,
        projectId: r.projectId,
        date: r.date,
        kind: "issue",
        reviewRound: r.round,
        uploadedBy: who.email,
        takenAt: now,
        width: img.width,
        height: img.height,
        size: img.full.length,
        thumbSize: img.thumb.length,
        data: { create: { full: img.full, thumb: img.thumb } },
      },
    });
  }
  await prisma.subReviewEvent.create({ data: { reviewId: id, round: r.round, action: "NEEDS_FIX", by: who.email, note, items, onSite: input.onSite } });
  await emailSubFix(id).catch((e) => console.error("Fix request email failed", { reviewId: id }, e));
  return { ok: true };
}

async function emailSubFix(reviewId: string): Promise<void> {
  const r = await prisma.subReview.findUnique({
    where: { id: reviewId },
    select: { contractorId: true, projectId: true, changeOrderId: true, date: true, fixItems: true, fixNote: true, contractor: { select: { name: true, email: true, language: true } } },
  });
  if (!r?.contractor.email) return;
  const lang = parseLang(r.contractor.language);
  const { title } = await jobTitle(r.projectId, r.changeOrderId);
  await ensurePortalToken(r.contractorId, false);
  const button = await subEmailButtonUrl(r.contractorId);
  const first = r.contractor.name.split(" ")[0] || r.contractor.name;
  const items = fixItemLabels(r.fixItems);
  const html = [
    `<h2 style="margin:0 0 12px;color:#E73C6E">${tr(lang, { en: "Fixes needed", es: "Hay arreglos pendientes" })}</h2>`,
    `<p>${tr(lang, { en: "Hi", es: "Hola" })} ${escapeHtml(first)},</p>`,
    `<p>${tr(lang, { en: "Sueep looked at your work on", es: "Sueep revisó tu trabajo en" })} <strong>${escapeHtml(title)}</strong> (${escapeHtml(dayLabel(r.date, lang))}) ${tr(lang, { en: "and needs some things fixed:", es: "y necesita que arregles algunas cosas:" })}</p>`,
    items.length ? `<ul style="padding-left:18px">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` : "",
    r.fixNote ? `<p>${escapeHtml(r.fixNote).replace(/\n/g, "<br>")}</p>` : "",
    `<p>${tr(lang, { en: "When it's done, take photos of the fixes on your jobs page and send them.", es: "Cuando esté listo, toma fotos de los arreglos en tu página de trabajos y envíalas." })}</p>`,
    button ? `<p style="margin:20px 0"><a href="${escapeHtml(button)}" style="${BUTTON}">${tr(lang, { en: "Open my jobs page", es: "Abrir mi página de trabajos" })}</a></p>` : "",
    `<p style="font-size:12px;color:#555">${tr(lang, { en: "Please don't forward this email, since the button signs you in.", es: "No reenvíes este correo, porque el botón inicia tu sesión." })}</p>`,
  ].join("");
  await sendEmail({
    type: "SUB_FIX_REQUESTED",
    to: r.contractor.email,
    link: `/erp/projects/${r.projectId}`,
    subject: tr(lang, { en: `Fixes needed: ${title}`, es: `Arreglos pendientes: ${title}` }),
    html,
    lang,
  });
}

// ── The sub's side ─────────────────────────────────────────────────────────

export type PortalFix = {
  reviewId: string;
  title: string;
  dateKey: string;
  items: string[];
  note: string | null;
  /** Staff photos of what to fix */
  issuePhotoIds: string[];
  /** Their fix photos so far this round */
  fixPhotoIds: string[];
};

/** The sub's open fix requests, for the top of their portal */
export async function portalFixes(contractorId: string): Promise<PortalFix[]> {
  const reviews = await prisma.subReview.findMany({
    where: { contractorId, status: "NEEDS_FIX" },
    orderBy: { date: "asc" },
    select: { id: true, projectId: true, changeOrderId: true, date: true, round: true, fixItems: true, fixNote: true, checkInId: true },
  });
  return Promise.all(
    reviews.map(async (r) => {
      const photos = await prisma.subJobPhoto.findMany({
        where: { checkInId: r.checkInId, reviewRound: r.round, kind: { in: ["issue", "fix"] } },
        orderBy: { takenAt: "asc" },
        select: { id: true, kind: true },
      });
      return {
        reviewId: r.id,
        title: (await jobTitle(r.projectId, r.changeOrderId)).title,
        dateKey: r.date.toISOString().slice(0, 10),
        items: fixItemLabels(r.fixItems),
        note: r.fixNote,
        issuePhotoIds: photos.filter((p) => p.kind === "issue").map((p) => p.id),
        fixPhotoIds: photos.filter((p) => p.kind === "fix").map((p) => p.id),
      };
    }),
  );
}

async function openFixFor(sub: LinkedSub, reviewId: string) {
  const r = await prisma.subReview.findUnique({ where: { id: reviewId }, select: { id: true, contractorId: true, status: true, round: true, checkInId: true, projectId: true, date: true } });
  if (!r || r.contractorId !== sub.id) return null;
  return r;
}

/** One fix photo from the sub for an open fix request */
export async function saveFixPhoto(sub: LinkedSub, reviewId: string, bytes: Buffer): Promise<{ ok: true; id: string } | { error: string; code: PhotoErrorCode }> {
  const lang = sub.lang;
  const r = await openFixFor(sub, reviewId);
  if (!r) return { code: "NOT_FOUND", error: "Not found" };
  if (r.status !== "NEEDS_FIX") return { code: "ALREADY_OUT", error: tr(lang, { en: "These fixes were already sent.", es: "Estos arreglos ya se enviaron." }) };
  if (bytes.length > MAX_PHOTO_UPLOAD_BYTES) return { code: "TOO_BIG", error: tr(lang, { en: "That photo is too big. Try again.", es: "Esa foto es muy grande. Intenta de nuevo." }) };
  const count = await prisma.subJobPhoto.count({ where: { checkInId: r.checkInId, kind: "fix", reviewRound: r.round } });
  if (count >= MAX_ROUND_PHOTOS) return { code: "TOO_MANY", error: tr(lang, { en: "That's the most photos for one fix.", es: "Es el máximo de fotos para un arreglo." }) };
  let img;
  try {
    img = await processPhoto(bytes);
  } catch {
    return { code: "BAD_IMAGE", error: tr(lang, { en: "We couldn't read that photo. Take it again with the camera.", es: "No pudimos leer esa foto. Tómala de nuevo con la cámara." }) };
  }
  const photo = await prisma.subJobPhoto.create({
    data: {
      checkInId: r.checkInId,
      contractorId: sub.id,
      projectId: r.projectId,
      date: r.date,
      kind: "fix",
      reviewRound: r.round,
      takenAt: new Date(),
      width: img.width,
      height: img.height,
      size: img.full.length,
      thumbSize: img.thumb.length,
      data: { create: { full: img.full, thumb: img.thumb } },
    },
    select: { id: true },
  });
  return { ok: true, id: photo.id };
}

/** The sub says the fixes are done: needs at least one fix photo. Opens the next round for review. */
export async function sendFixes(sub: LinkedSub, reviewId: string): Promise<{ ok: true } | { error: string; code: string }> {
  const lang = sub.lang;
  const r = await openFixFor(sub, reviewId);
  if (!r) return { code: "NOT_FOUND", error: "Not found" };
  if (r.status !== "NEEDS_FIX") return { code: "ALREADY_SENT", error: tr(lang, { en: "These fixes were already sent.", es: "Estos arreglos ya se enviaron." }) };
  const photos = await prisma.subJobPhoto.count({ where: { checkInId: r.checkInId, kind: "fix", reviewRound: r.round } });
  if (photos === 0) return { code: "NO_PHOTOS", error: tr(lang, { en: "Take at least one photo of the fixes first.", es: "Primero toma al menos una foto de los arreglos." }) };
  const done = await prisma.subReview.updateMany({ where: { id: reviewId, status: "NEEDS_FIX" }, data: { status: "PENDING", round: r.round + 1 } });
  if (done.count === 0) return { code: "ALREADY_SENT", error: tr(lang, { en: "These fixes were already sent.", es: "Estos arreglos ya se enviaron." }) };
  await prisma.subReviewEvent.create({ data: { reviewId, round: r.round, action: "FIX_SENT", by: "sub" } });
  await emailStaffReady(reviewId, true).catch((e) => console.error("Fixes ready email failed", { reviewId }, e));
  return { ok: true };
}

/** Whether the sub may remove this fix photo: theirs, this round, not sent yet */
export async function canRemoveFixPhoto(contractorId: string, photo: { kind: string; reviewRound: number | null; checkInId: string }): Promise<boolean> {
  if (photo.kind !== "fix") return false;
  const r = await prisma.subReview.findUnique({ where: { checkInId: photo.checkInId }, select: { contractorId: true, status: true, round: true } });
  return !!r && r.contractorId === contractorId && r.status === "NEEDS_FIX" && r.round === photo.reviewRound;
}

// ── Reading reviews (staff) ────────────────────────────────────────────────

export type ReviewListRow = {
  id: string;
  status: ReviewStatus;
  round: number;
  dateKey: string;
  title: string;
  projectId: string;
  subName: string;
  pmEmail: string | null;
  updatedAt: string;
  canReview: boolean;
};

/** Reviews for the Sub Reviews page. `mine` limits a PM to their own days and days with no PM. */
export async function loadReviewList(who: Reviewer, opts: { status: ReviewStatus | ReviewStatus[]; mine: boolean }): Promise<ReviewListRow[]> {
  const since = new Date(Date.now() - 60 * 86_400_000);
  const statuses = Array.isArray(opts.status) ? opts.status : [opts.status];
  const rows = await prisma.subReview.findMany({
    where: {
      status: { in: statuses },
      AND: [
        // Passed ones only from the last 60 days
        ...(statuses.includes("PASSED") ? [{ OR: [{ status: { not: "PASSED" } }, { passedAt: { gte: since } }] }] : []),
        ...(opts.mine ? [{ OR: [{ pmUserId: who.uid }, { pmUserId: null }] }] : []),
      ],
    },
    orderBy: statuses.length === 1 && statuses[0] === "PASSED" ? { passedAt: "desc" } : { updatedAt: "asc" },
    take: 200,
    select: { id: true, status: true, round: true, date: true, projectId: true, changeOrderId: true, pmUserId: true, updatedAt: true, contractor: { select: { name: true } } },
  });
  const pmIds = [...new Set(rows.flatMap((r) => (r.pmUserId ? [r.pmUserId] : [])))];
  const pms = new Map((await prisma.erpUser.findMany({ where: { id: { in: pmIds } }, select: { id: true, email: true } })).map((u) => [u.id, u.email]));
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      status: r.status as ReviewStatus,
      round: r.round,
      dateKey: r.date.toISOString().slice(0, 10),
      title: (await jobTitle(r.projectId, r.changeOrderId)).title,
      projectId: r.projectId,
      subName: r.contractor.name,
      pmEmail: r.pmUserId ? (pms.get(r.pmUserId) ?? null) : null,
      updatedAt: r.updatedAt.toISOString(),
      canReview: canReview(who, r),
    })),
  );
}

/** Review status per check-in id, for day cards, the Sub Photos tab and the portal's Past tab */
export async function reviewsByCheckIn(checkInIds: string[]): Promise<Map<string, { id: string; status: ReviewStatus; round: number }>> {
  if (checkInIds.length === 0) return new Map();
  const rows = await prisma.subReview.findMany({ where: { checkInId: { in: checkInIds } }, select: { id: true, checkInId: true, status: true, round: true } });
  return new Map(rows.map((r) => [r.checkInId, { id: r.id, status: r.status as ReviewStatus, round: r.round }]));
}

/** Count waiting for this reviewer, for the nav */
export async function pendingReviewCount(who: Reviewer): Promise<number> {
  if (!isPmLevel(who.role)) return 0;
  return prisma.subReview.count({
    where: { status: "PENDING", ...(who.role === "PROJECT_MANAGER" ? { OR: [{ pmUserId: who.uid }, { pmUserId: null }] } : {}) },
  });
}

// ── Billing gate ───────────────────────────────────────────────────────────

/**
 * With "Quality check must pass before billing" on, why this project can't be
 * marked Billed yet; null when it can (or the switch is off).
 */
export async function billingBlockedBySubReview(projectId: string): Promise<string | null> {
  const { qcBlocksBilling } = await loadSubPortalSettings();
  if (!qcBlocksBilling) return null;
  const open = await prisma.subReview.findMany({ where: { projectId, status: { not: "PASSED" } }, select: { status: true, date: true, contractor: { select: { name: true } } } });
  if (open.length === 0) return null;
  const list = open.map((r) => `${r.contractor.name} ${dayLabel(r.date)} (${r.status === "NEEDS_FIX" ? "needs fixes" : "waiting for review"})`).join(", ");
  return `Sub work on this job hasn't passed its quality check yet: ${list}. See Sub Reviews, or turn off "Quality check must pass before billing" on Settings, Subs.`;
}

// ── One review, for its page ───────────────────────────────────────────────

export type ReviewPhoto = { id: string; kind: string; area: string | null; takenAt: string; offSite: boolean; round: number | null };

export type ReviewDetail = {
  id: string;
  status: ReviewStatus;
  round: number;
  title: string;
  projectId: string;
  dateKey: string;
  subName: string;
  subPhone: string | null;
  turnover: boolean;
  canReview: boolean;
  checkIn: { inAt: string | null; outAt: string | null; lateMinutes: number | null; inOffSite: boolean; outOffSite: boolean; crewCount: number | null; waivedReason: string | null };
  photos: ReviewPhoto[];
  events: { at: string; round: number; action: string; by: string; note: string | null; items: string[]; onSite: boolean }[];
  fixItems: string[];
  fixNote: string | null;
};

export async function loadReviewDetail(id: string, who: Reviewer): Promise<ReviewDetail | null> {
  const r = await prisma.subReview.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      round: true,
      projectId: true,
      changeOrderId: true,
      date: true,
      pmUserId: true,
      fixItems: true,
      fixNote: true,
      contractor: { select: { name: true, phone: true } },
      events: { orderBy: { createdAt: "asc" } },
      checkIn: {
        select: {
          checkInAt: true,
          checkOutAt: true,
          lateMinutes: true,
          inOffSite: true,
          outOffSite: true,
          crewCount: true,
          photosWaivedReason: true,
          photos: { orderBy: { takenAt: "asc" }, select: { id: true, kind: true, area: true, takenAt: true, offSite: true, reviewRound: true } },
        },
      },
    },
  });
  if (!r) return null;
  const { title, turnover } = await jobTitle(r.projectId, r.changeOrderId);
  return {
    id: r.id,
    status: r.status as ReviewStatus,
    round: r.round,
    title,
    projectId: r.projectId,
    dateKey: r.date.toISOString().slice(0, 10),
    subName: r.contractor.name,
    subPhone: r.contractor.phone,
    turnover,
    canReview: canReview(who, r),
    checkIn: {
      inAt: r.checkIn.checkInAt?.toISOString() ?? null,
      outAt: r.checkIn.checkOutAt?.toISOString() ?? null,
      lateMinutes: r.checkIn.lateMinutes,
      inOffSite: r.checkIn.inOffSite,
      outOffSite: r.checkIn.outOffSite,
      crewCount: r.checkIn.crewCount,
      waivedReason: r.checkIn.photosWaivedReason,
    },
    photos: r.checkIn.photos.map((p) => ({ id: p.id, kind: p.kind, area: p.area, takenAt: p.takenAt.toISOString(), offSite: p.offSite, round: p.reviewRound })),
    events: r.events.map((e) => ({ at: e.createdAt.toISOString(), round: e.round, action: e.action, by: e.by, note: e.note, items: fixItemLabels(e.items), onSite: e.onSite })),
    fixItems: fixItemLabels(r.fixItems),
    fixNote: r.fixNote,
  };
}

/** Review results on the sub's own days, keyed "<jobKey>|<YYYY-MM-DD>", for their Past tab */
export async function portalReviewResults(contractorId: string): Promise<Record<string, ReviewStatus>> {
  const rows = await prisma.subReview.findMany({ where: { contractorId }, select: { status: true, date: true, checkIn: { select: { jobKey: true } } } });
  return Object.fromEntries(rows.map((r) => [`${r.checkIn.jobKey}|${r.date.toISOString().slice(0, 10)}`, r.status as ReviewStatus]));
}
