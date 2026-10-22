/**
 * Sub change order requests on turnovers. A sub running a turnover day gets a
 * "Request a change order" button in their schedule invite (and on the
 * Confirm page). It opens /co-request/[token], using the same token as the
 * invite's Confirm link, so no login is needed.
 *
 * The sub adds photos, picks issues from the building's CO package (or
 * Other), and sees their pay. Prices are taken from the package on the
 * server and copied onto the request. The sub never sees our charge.
 *
 * Once saved it's routed to the office or the property manager
 * (subCoRequestReview.ts).
 */
import { prisma } from "@/lib/prisma";
import { CO_ISSUE_PER_LABELS, coIssueLabel, getCoPricingPackage, type CoIssuePer } from "@/lib/coPricingPackage";
import { parseLang, tr, type Lang } from "./language";
import { todayEasternKey } from "./dates";
import { addDaysKey } from "./manualHoursRepeat";
import { routeNewSubCoRequest } from "./subCoRequestReview";

const TURNOVER_SEGMENT = "JANITORIAL_TURNOVER_REQUESTS";
/** The link stops taking new requests this many days after the scheduled day. */
const OPEN_DAYS_AFTER = 14;
const CLOSED_PROJECT_STATUSES = ["ARCHIVED", "CANCELLED"];

export const CO_PHOTO_MAX_BYTES = 4 * 1024 * 1024;
/** Plain photo formats only (no SVG, which can carry scripts when served back) */
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
export const CO_PHOTOS_MIN = 1;
export const CO_PHOTOS_MAX = 10;
const MAX_LINES = 20;
const MAX_OTHER_LINES = 5;
const MAX_QUANTITY = 99;
/** Unsent photos one link can hold at once */
const MAX_LOOSE_PHOTOS = 20;
/** Requests one sub can send for one unit per day */
const MAX_REQUESTS_PER_DAY = 10;

export function isCoRequestToken(token: string): boolean {
  return /^[a-f0-9]{48}$/.test(token);
}

/** Page path for a schedule invite token. */
export function coRequestPath(token: string): string {
  return `/co-request/${token}`;
}

/** Full link for emails. Null when the app address isn't set (no working link to send). */
export function coRequestUrl(token: string): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  return base && !/your-vercel-domain/.test(base) ? `${base}${coRequestPath(token)}` : null;
}

function contractorIdFromUid(uid: string): string | null {
  return uid.match(/^day-assignment-[A-Za-z0-9]+-sub-([A-Za-z0-9]+)@sueep\.com$/)?.[1] ?? null;
}

type Access = {
  uid: string;
  dateKey: string;
  personName: string;
  lang: Lang;
  contractorId: string;
  project: { id: string; jobTitle: string; building: { id: string; name: string; coPricingPackage: unknown } | null };
  /** Why new requests can't be sent; past ones can still be seen */
  closed: string | null;
};

/** Who the link belongs to and whether it can still send requests. Null when it isn't a turnover sub link. */
async function accessFor(token: string): Promise<Access | null> {
  if (!isCoRequestToken(token)) return null;
  const c = await prisma.scheduleConfirmation.findUnique({ where: { token } });
  if (!c || c.kind !== "day-sub") return null;
  const contractorId = contractorIdFromUid(c.uid);
  if (!contractorId) return null;
  const [day, contractor] = await Promise.all([
    prisma.projectDayAssignment.findUnique({
      where: { id: c.assignmentId },
      select: {
        project: {
          select: { id: true, jobTitle: true, segment: true, status: true, building: { select: { id: true, name: true, coPricingPackage: true } } },
        },
      },
    }),
    prisma.contractor.findUnique({ where: { id: contractorId }, select: { id: true, name: true, language: true } }),
  ]);
  if (!day?.project || day.project.segment !== TURNOVER_SEGMENT || !contractor) return null;
  const lang = parseLang(contractor.language);
  const t = (en: string, es: string) => tr(lang, { en, es });
  const closed =
    c.status === "CANCELLED"
      ? t("You're no longer scheduled on this unit.", "Ya no estás programado en esta unidad.")
      : c.status === "DECLINED"
        ? t("You said you can't make it to this unit.", "Dijiste que no puedes ir a esta unidad.")
        : CLOSED_PROJECT_STATUSES.includes(day.project.status)
          ? t("This unit is closed.", "Esta unidad está cerrada.")
          : addDaysKey(c.dateKey, OPEN_DAYS_AFTER) < todayEasternKey()
            ? t("This link is too old to send new requests. Call the office.", "Este enlace es muy antiguo para enviar solicitudes. Llama a la oficina.")
            : null;
  return {
    uid: c.uid,
    dateKey: c.dateKey,
    personName: contractor.name || c.personName,
    lang,
    contractorId: contractor.id,
    project: { id: day.project.id, jobTitle: day.project.jobTitle, building: day.project.building },
    closed,
  };
}

/** For the Confirm page: the CO link when this invite is a turnover sub that can still send requests. */
export async function coRequestOpenFor(token: string): Promise<boolean> {
  const a = await accessFor(token).catch(() => null);
  return !!a && !a.closed;
}

/** For the invite email: is this day a turnover (so the sub gets the CO button)? */
export async function isTurnoverProject(projectId: string | null | undefined): Promise<boolean> {
  if (!projectId) return false;
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { segment: true } });
  return p?.segment === TURNOVER_SEGMENT;
}

export type CoRequestStatusWord = { text: string; tone: "gray" | "amber" | "green" | "red" };

function statusWord(status: string, lang: Lang): CoRequestStatusWord {
  switch (status) {
    case "CANCELLED":
      return { text: tr(lang, { en: "Cancelled", es: "Cancelada" }), tone: "gray" };
    case "APPROVED":
      return { text: tr(lang, { en: "Approved", es: "Aprobada" }), tone: "green" };
    case "DENIED":
      return { text: tr(lang, { en: "Not approved, don't do it", es: "No aprobada, no la hagas" }), tone: "red" };
    default:
      return { text: tr(lang, { en: "Sent, waiting for approval", es: "Enviada, esperando aprobación" }), tone: "amber" };
  }
}

export type CoRequestView = {
  firstName: string;
  lang: Lang;
  unit: string;
  building: string | null;
  closed: string | null;
  issues: { id: string; label: string; per: string; subPayCents: number }[];
  past: {
    id: string;
    sentAt: string;
    status: CoRequestStatusWord;
    lines: { label: string; quantity: number; subPayCents: number | null; description: string | null }[];
    subTotalCents: number;
    hasUnpriced: boolean;
    photoIds: string[];
  }[];
};

/** Everything the sub's page shows. Sub pay only: no charge prices leave the server. */
export async function loadCoRequestView(token: string): Promise<CoRequestView | null> {
  const a = await accessFor(token);
  if (!a) return null;
  const pkg = getCoPricingPackage(a.project.building?.coPricingPackage ?? null);
  const past = await prisma.subCoRequest.findMany({
    where: { projectId: a.project.id, contractorId: a.contractorId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      status: true,
      subTotalCents: true,
      surchargeLabel: true,
      surchargePercent: true,
      items: { orderBy: { sortOrder: "asc" }, select: { label: true, labelEs: true, quantity: true, unitSubPayCents: true, description: true } },
      photos: { select: { id: true }, orderBy: { createdAt: "asc" } },
    },
  });
  return {
    firstName: a.personName.split(/\s+/)[0] || a.personName,
    lang: a.lang,
    unit: a.project.jobTitle,
    building: a.project.building?.name ?? null,
    closed: a.closed,
    issues: pkg.issues
      .filter((i) => i.active)
      .map((i) => ({ id: i.id, label: coIssueLabel(i, a.lang), per: CO_ISSUE_PER_LABELS[i.per][a.lang], subPayCents: Math.round(i.subPay * 100) })),
    past: past.map((r) => {
      const linesTotal = r.items.reduce((s, i) => s + (i.unitSubPayCents ?? 0) * i.quantity, 0);
      // An office surcharge isn't shown to the sub until it's approved
      const surcharge =
        r.status === "APPROVED" && r.surchargePercent
          ? [{ label: `${r.surchargeLabel ?? ""} (+${r.surchargePercent}%)`.trim(), quantity: 1, subPayCents: r.subTotalCents - linesTotal, description: null }]
          : [];
      return {
        id: r.id,
        sentAt: r.createdAt.toISOString(),
        status: statusWord(r.status, a.lang),
        lines: [
          ...r.items.map((i) => ({
            label: a.lang === "es" && i.labelEs ? i.labelEs : i.label,
            quantity: i.quantity,
            subPayCents: i.unitSubPayCents == null ? null : i.unitSubPayCents * i.quantity,
            description: i.description,
          })),
          ...surcharge,
        ],
        subTotalCents: surcharge.length ? r.subTotalCents : linesTotal,
        hasUnpriced: r.items.some((i) => i.unitSubPayCents == null),
        photoIds: r.photos.map((p) => p.id),
      };
    }),
  };
}

type Fail = { error: string; status: number };

const INVALID: Fail = { error: "This link isn't valid anymore.", status: 404 };

/** One photo, uploaded before the request is sent. */
export async function uploadCoPhoto(token: string, file: File): Promise<Fail | { id: string }> {
  const a = await accessFor(token);
  if (!a) return INVALID;
  const t = (en: string, es: string) => tr(a.lang, { en, es });
  if (a.closed) return { error: a.closed, status: 400 };
  if (!PHOTO_TYPES.includes(file.type)) return { error: t("Only photos can be added.", "Solo se pueden agregar fotos."), status: 400 };
  if (file.size > CO_PHOTO_MAX_BYTES) return { error: t("That photo is too big (4 MB max).", "Esa foto es muy grande (máximo 4 MB)."), status: 400 };
  // Photos from requests that were never sent
  await prisma.subCoRequestPhoto.deleteMany({ where: { requestId: null, createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
  const loose = await prisma.subCoRequestPhoto.count({ where: { confirmationUid: a.uid, requestId: null } });
  if (loose >= MAX_LOOSE_PHOTOS) return { error: t("Too many photos. Send the request first.", "Demasiadas fotos. Envía la solicitud primero."), status: 400 };
  const data = Buffer.from(await file.arrayBuffer());
  const photo = await prisma.subCoRequestPhoto.create({
    data: { confirmationUid: a.uid, filename: (file.name || "photo").slice(0, 200), mimeType: file.type, size: data.length, data },
    select: { id: true },
  });
  return photo;
}

/** Removes a photo that hasn't been sent yet. */
export async function deleteCoPhoto(token: string, photoId: string): Promise<boolean> {
  const a = await accessFor(token);
  if (!a) return false;
  const r = await prisma.subCoRequestPhoto.deleteMany({ where: { id: photoId, confirmationUid: a.uid, requestId: null } });
  return r.count > 0;
}

/** A photo the sub uploaded from this link, or one on their requests for this unit. */
export async function getCoPhoto(token: string, photoId: string) {
  const a = await accessFor(token);
  if (!a) return null;
  return prisma.subCoRequestPhoto.findFirst({
    where: {
      id: photoId,
      OR: [{ confirmationUid: a.uid }, { request: { projectId: a.project.id, contractorId: a.contractorId } }],
    },
    select: { data: true, mimeType: true },
  });
}

export type CoRequestInput = {
  lines: { issueId?: string | null; quantity?: number; description?: string | null }[];
  photoIds: string[];
  note?: string | null;
};

/** Saves the request with prices from the building's CO package. */
export async function submitCoRequest(token: string, input: CoRequestInput): Promise<Fail | { id: string }> {
  const a = await accessFor(token);
  if (!a) return INVALID;
  const t = (en: string, es: string) => tr(a.lang, { en, es });
  const bad = (en: string, es: string): Fail => ({ error: t(en, es), status: 400 });
  if (a.closed) return { error: a.closed, status: 400 };

  const rawLines = Array.isArray(input.lines) ? input.lines : [];
  if (!rawLines.length) return bad("Pick at least one issue.", "Elige al menos un problema.");
  if (rawLines.length > MAX_LINES) return bad("Too many lines. Send two requests.", "Demasiadas líneas. Envía dos solicitudes.");

  const pkg = getCoPricingPackage(a.project.building?.coPricingPackage ?? null);
  const byId = new Map(pkg.issues.filter((i) => i.active).map((i) => [i.id, i]));
  const items: {
    issueId: string | null;
    label: string;
    labelEs: string | null;
    per: CoIssuePer | null;
    quantity: number;
    description: string | null;
    unitChargeCents: number | null;
    unitSubPayCents: number | null;
    sortOrder: number;
  }[] = [];
  let others = 0;
  for (const [index, line] of rawLines.entries()) {
    const quantity = Math.floor(Number(line?.quantity ?? 1));
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_QUANTITY) return bad("Each quantity must be 1 to 99.", "Cada cantidad debe ser de 1 a 99.");
    if (line?.issueId) {
      const issue = byId.get(String(line.issueId));
      if (!issue) return bad("One of the issues isn't offered anymore. Reload the page.", "Uno de los problemas ya no está disponible. Recarga la página.");
      items.push({
        issueId: issue.id,
        label: issue.label,
        labelEs: issue.labelEs || null,
        per: issue.per,
        quantity,
        description: null,
        unitChargeCents: Math.round(issue.charge * 100),
        unitSubPayCents: Math.round(issue.subPay * 100),
        sortOrder: index,
      });
    } else {
      const description = String(line?.description ?? "").trim().slice(0, 500);
      if (description.length < 3) return bad("Describe the Other issue.", "Describe el otro problema.");
      if (++others > MAX_OTHER_LINES) return bad("Too many Other lines.", "Demasiadas líneas de Otro.");
      items.push({ issueId: null, label: "Other", labelEs: "Otro", per: null, quantity, description, unitChargeCents: null, unitSubPayCents: null, sortOrder: index });
    }
  }

  const photoIds = [...new Set((Array.isArray(input.photoIds) ? input.photoIds : []).map(String))];
  if (photoIds.length < CO_PHOTOS_MIN) return bad("Add at least one photo.", "Agrega al menos una foto.");
  if (photoIds.length > CO_PHOTOS_MAX) return bad("10 photos max.", "Máximo 10 fotos.");

  const recent = await prisma.subCoRequest.count({
    where: { projectId: a.project.id, contractorId: a.contractorId, createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
  if (recent >= MAX_REQUESTS_PER_DAY) return bad("Too many requests today. Call the office.", "Demasiadas solicitudes hoy. Llama a la oficina.");

  const sum = (key: "unitChargeCents" | "unitSubPayCents") => items.reduce((s, i) => s + (i[key] ?? 0) * i.quantity, 0);
  const note = String(input.note ?? "").trim().slice(0, 1000) || null;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const request = await tx.subCoRequest.create({
        data: {
          projectId: a.project.id,
          contractorId: a.contractorId,
          confirmationUid: a.uid,
          note,
          lang: a.lang,
          subTotalCents: sum("unitSubPayCents"),
          chargeTotalCents: sum("unitChargeCents"),
          items: { create: items },
        },
        select: { id: true },
      });
      const attached = await tx.subCoRequestPhoto.updateMany({
        where: { id: { in: photoIds }, confirmationUid: a.uid, requestId: null },
        data: { requestId: request.id },
      });
      if (attached.count !== photoIds.length) throw new Error("PHOTOS");
      return request;
    });
    await routeNewSubCoRequest(created.id).catch((e) => console.error("Sub CO request routing failed", { id: created.id }, e));
    return created;
  } catch (e) {
    if (e instanceof Error && e.message === "PHOTOS") return bad("Some photos didn't upload. Add them again.", "Algunas fotos no se subieron. Agrégalas de nuevo.");
    throw e;
  }
}
