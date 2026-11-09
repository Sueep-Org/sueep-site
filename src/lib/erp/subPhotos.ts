/**
 * Before and after photos a sub takes from the Today tab of their portal
 * (SubJobPhoto). They belong to that day's check-in (subCheckIns.ts):
 *
 * - Taken after checking in and before checking out. The sub running the day
 *   needs the Settings minimums (subPhotoRules.ts) to check out, unless a
 *   PM, Business Manager or Admin lets them check out without (waivePhotos).
 * - The phone shrinks and time-stamps each photo before upload. Here it is
 *   re-encoded anyway (photoProcessing.ts: upright, 1600px JPEG, EXIF and
 *   GPS dropped) and a 320px preview is made. Bytes go in SubJobPhotoData; everything else only reads ids.
 * - Where the phone was when the photo was sent is saved and compared to
 *   the job site like a check-in, flagged Off site past the Settings distance.
 *
 * Server only.
 */
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { easternDateKey } from "@/lib/erp/janitorialHours";
import { findJobDay, measure, siteCoordinates, tapTime, utcDay, type Position } from "@/lib/erp/subCheckIns";
import { loadSubPortalSettings } from "@/lib/erp/subPortalSettingsServer";
import { photoNeeds, type PhotoCounts } from "@/lib/erp/subPhotoRules";
import { parsePhotoArea, type PhotoKind } from "@/lib/erp/subPhotoAreas";
import { tr } from "@/lib/erp/language";
import { processPhoto, type ProcessedPhoto } from "@/lib/erp/photoProcessing";
import type { LinkedSub } from "@/lib/erp/subPortalAccess";

/** Vercel rejects bodies over ~4.5 MB before the route runs */
export const MAX_PHOTO_UPLOAD_BYTES = 4 * 1024 * 1024;
/** Per check-in, so a stuck phone can't fill the database */
export const MAX_PHOTOS_PER_DAY = 40;

export type PhotoErrorCode = "NOT_IN" | "ALREADY_OUT" | "TOO_MANY" | "BAD_IMAGE" | "TOO_BIG" | "NOT_FOUND" | "INVALID";

export function parsePhotoKind(v: unknown): PhotoKind | null {
  return v === "before" || v === "after" ? v : null;
}

/** Saves one photo against the sub's check-in for that job and day. */
export async function savePhoto(
  sub: LinkedSub,
  input: { jobKey: string; kind: PhotoKind; area: unknown; takenAt: unknown; position: Position | null; bytes: Buffer },
): Promise<{ ok: true; id: string } | { error: string; code: PhotoErrorCode }> {
  const lang = sub.lang;
  if (input.bytes.length > MAX_PHOTO_UPLOAD_BYTES) {
    return { code: "TOO_BIG", error: tr(lang, { en: "That photo is too big. Try again.", es: "Esa foto es muy grande. Intenta de nuevo." }) };
  }
  const takenAt = tapTime(input.takenAt, new Date());
  const dateKey = easternDateKey(takenAt);
  const checkIn = await prisma.subCheckIn.findUnique({
    where: { contractorId_jobKey_date: { contractorId: sub.id, jobKey: input.jobKey, date: utcDay(dateKey) } },
    select: { id: true, projectId: true, date: true, checkInAt: true, checkOutAt: true },
  });
  if (!checkIn?.checkInAt) return { code: "NOT_IN", error: tr(lang, { en: "Check in first, then add photos.", es: "Primero registra tu entrada y luego agrega fotos." }) };
  // A photo sent late from the phone's queue still counts if it was taken before check-out
  if (checkIn.checkOutAt && takenAt > checkIn.checkOutAt) {
    return { code: "ALREADY_OUT", error: tr(lang, { en: "You already checked out of this job.", es: "Ya registraste tu salida de este trabajo." }) };
  }
  const count = await prisma.subJobPhoto.count({ where: { checkInId: checkIn.id } });
  if (count >= MAX_PHOTOS_PER_DAY) {
    return { code: "TOO_MANY", error: tr(lang, { en: `That's the most photos for one day (${MAX_PHOTOS_PER_DAY}).`, es: `Es el máximo de fotos para un día (${MAX_PHOTOS_PER_DAY}).` }) };
  }

  let img: ProcessedPhoto;
  try {
    img = await processPhoto(input.bytes);
  } catch {
    return {
      code: "BAD_IMAGE",
      error: tr(lang, { en: "We couldn't read that photo. Take it again with the camera.", es: "No pudimos leer esa foto. Tómala de nuevo con la cámara." }),
    };
  }

  const job = await findJobDay(sub.id, input.jobKey, dateKey);
  let place: { meters: number; offSite: boolean } | null = null;
  if (input.position && job) {
    const at = await siteCoordinates(job.site, false);
    if (at) place = measure(input.position, at, (await loadSubPortalSettings()).checkInFarMeters);
  }

  const photo = await prisma.subJobPhoto.create({
    data: {
      checkInId: checkIn.id,
      contractorId: sub.id,
      projectId: checkIn.projectId,
      date: checkIn.date,
      kind: input.kind,
      area: parsePhotoArea(input.area, job?.turnover ?? false),
      takenAt,
      latitude: input.position?.latitude ?? null,
      longitude: input.position?.longitude ?? null,
      accuracy: input.position?.accuracy ?? null,
      meters: place?.meters ?? null,
      offSite: place?.offSite ?? false,
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

/** The sub takes back one of their photos, only until they check out. */
export async function deleteOwnPhoto(sub: LinkedSub, photoId: string): Promise<{ ok: true } | { error: string; code: PhotoErrorCode }> {
  const photo = await prisma.subJobPhoto.findUnique({
    where: { id: photoId },
    select: { contractorId: true, kind: true, reviewRound: true, checkInId: true, checkIn: { select: { checkOutAt: true } } },
  });
  if (!photo || photo.contractorId !== sub.id || photo.kind === "issue") return { code: "NOT_FOUND", error: "Not found" };
  if (photo.kind === "fix") {
    // Loaded here, not at the top: subReviews imports this file
    const { canRemoveFixPhoto } = await import("@/lib/erp/subReviews");
    if (!(await canRemoveFixPhoto(sub.id, photo))) {
      return { code: "ALREADY_OUT", error: tr(sub.lang, { en: "These fixes were already sent.", es: "Estos arreglos ya se enviaron." }) };
    }
  } else if (photo.checkIn.checkOutAt) {
    return { code: "ALREADY_OUT", error: tr(sub.lang, { en: "Photos can't be removed after checking out.", es: "No se pueden quitar fotos después de registrar la salida." }) };
  }
  await prisma.subJobPhoto.delete({ where: { id: photoId } });
  return { ok: true };
}

/** The image bytes. Pass contractorId to only serve that sub's own photos. */
export async function photoBytes(photoId: string, size: "full" | "thumb", contractorId?: string): Promise<Buffer | null> {
  const owner = { photo: { select: { contractorId: true } } } as const;
  // One column only, so a preview never loads the full image
  const row =
    size === "full"
      ? await prisma.subJobPhotoData.findUnique({ where: { photoId }, select: { full: true, ...owner } }).then((r) => r && { bytes: r.full, owner: r.photo.contractorId })
      : await prisma.subJobPhotoData.findUnique({ where: { photoId }, select: { thumb: true, ...owner } }).then((r) => r && { bytes: r.thumb, owner: r.photo.contractorId });
  if (!row || (contractorId && row.owner !== contractorId)) return null;
  return Buffer.from(row.bytes);
}

/** A PM, Business Manager or Admin lets the sub check out without the minimum photos. */
export async function waivePhotos(checkInId: string, by: string, reason: string): Promise<{ ok: true } | { error: string }> {
  const row = await prisma.subCheckIn.findUnique({ where: { id: checkInId }, select: { checkInAt: true, checkOutAt: true, photosWaivedAt: true } });
  if (!row?.checkInAt) return { error: "They haven't checked in." };
  if (row.checkOutAt) return { error: "They already checked out." };
  if (row.photosWaivedAt) return { ok: true };
  await prisma.subCheckIn.update({ where: { id: checkInId }, data: { photosWaivedAt: new Date(), photosWaivedBy: by, photosWaivedReason: reason } });
  return { ok: true };
}

// ── Reading photos ─────────────────────────────────────────────────────────

export type StaffPhoto = { id: string; kind: PhotoKind; area: string | null; takenAt: string; offSite: boolean; meters: number | null; width: number; height: number };

export type StaffPhotoDay = {
  checkInId: string;
  dateKey: string;
  subName: string;
  /** Change order title, for CO days */
  changeOrder: string | null;
  role: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  needs: PhotoCounts;
  waived: { at: string; by: string | null; reason: string | null } | null;
  review: { id: string; status: string; round: number } | null;
  photos: StaffPhoto[];
};

/** Every sub photo on a project (its change orders too), newest day first, for the project's Sub Photos tab. */
export const projectSubPhotos = cache(async function projectSubPhotos(projectId: string): Promise<StaffPhotoDay[]> {
  const checkIns = await prisma.subCheckIn.findMany({
    where: { projectId, OR: [{ photos: { some: {} } }, { checkInAt: { not: null } }] },
    orderBy: [{ date: "desc" }, { checkInAt: "asc" }],
    select: {
      id: true,
      date: true,
      role: true,
      checkInAt: true,
      checkOutAt: true,
      photosWaivedAt: true,
      photosWaivedBy: true,
      photosWaivedReason: true,
      review: { select: { id: true, status: true, round: true } },
      contractor: { select: { name: true } },
      changeOrder: { select: { title: true } },
      project: { select: { segment: true } },
      photos: {
        orderBy: { takenAt: "asc" },
        select: { id: true, kind: true, area: true, takenAt: true, offSite: true, meters: true, width: true, height: true },
      },
    },
  });
  const settings = await loadSubPortalSettings();
  return checkIns.map((c) => ({
    checkInId: c.id,
    dateKey: c.date.toISOString().slice(0, 10),
    subName: c.contractor.name,
    changeOrder: c.changeOrder?.title ?? null,
    role: c.role,
    checkInAt: c.checkInAt?.toISOString() ?? null,
    checkOutAt: c.checkOutAt?.toISOString() ?? null,
    needs: photoNeeds(c.role, c.project.segment === "JANITORIAL_TURNOVER_REQUESTS", settings),
    waived: c.photosWaivedAt ? { at: c.photosWaivedAt.toISOString(), by: c.photosWaivedBy, reason: c.photosWaivedReason } : null,
    review: c.review,
    photos: c.photos.map((p) => ({
      id: p.id,
      kind: p.kind as PhotoKind,
      area: p.area,
      takenAt: p.takenAt.toISOString(),
      offSite: p.offSite,
      meters: p.meters,
      width: p.width,
      height: p.height,
    })),
  }));
});

