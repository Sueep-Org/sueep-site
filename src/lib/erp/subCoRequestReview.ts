/**
 * Office side of sub change order requests (see subCoRequests.ts for the
 * sub's side). A new request is routed right away:
 * - an Other line with no price, or no property manager email for the
 *   building: OFFICE_REVIEW, and David and Jennifer are emailed (SUB_CO_REVIEW)
 * - otherwise READY, and it's emailed to the property manager right away
 *   (subCoApproval.ts), which makes it WAITING_PM
 *
 * On the unit's CO Requests tab the office can change prices and quantities,
 * price Other lines, add a Next day / Weekend surcharge, send it on, or
 * cancel it (the sub is told).
 */
import { prisma } from "@/lib/prisma";
import { escapeHtml, sendEmail } from "@/lib/email";
import { getCoPricingPackage } from "@/lib/coPricingPackage";
import { centsToDollars } from "./money";
import { tr, parseLang } from "./language";
import { propertyManagerEmailsFor, sendToPropertyManager, subCoRequestsPath } from "./subCoApproval";
import { answerLockedReason, applySubCoAnswer } from "./subCoOutcome";

export { propertyManagerEmailsFor, subCoRequestsPath };

/** Statuses the office can still change */
export const SUB_CO_OPEN_STATUSES = ["SUBMITTED", "OFFICE_REVIEW", "READY", "WAITING_PM"];
const MAX_CENTS = 10_000_000;

export const SUB_CO_STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "New",
  OFFICE_REVIEW: "Needs office",
  READY: "Not emailed yet",
  WAITING_PM: "Waiting on property manager",
  APPROVED: "Approved",
  DENIED: "Denied",
  CANCELLED: "Cancelled",
};

type LineAmounts = { quantity: number; unitChargeCents: number | null; unitSubPayCents: number | null };

/** Totals of the priced lines with the surcharge on top (same percent on both). */
export function subCoTotals(lines: LineAmounts[], surchargePercent: number | null | undefined) {
  const factor = 1 + (surchargePercent ?? 0) / 100;
  const sum = (key: "unitChargeCents" | "unitSubPayCents") => lines.reduce((s, l) => s + (l[key] ?? 0) * l.quantity, 0);
  return { chargeTotalCents: Math.round(sum("unitChargeCents") * factor), subTotalCents: Math.round(sum("unitSubPayCents") * factor) };
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
}

async function addEvent(requestId: string, actor: string, text: string) {
  await prisma.subCoRequestEvent.create({ data: { requestId, actor, text } });
}

const loadForRouting = (id: string) =>
  prisma.subCoRequest.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      photos: { select: { id: true } },
      contractor: { select: { name: true, email: true, language: true } },
      project: { select: { id: true, jobTitle: true, buildingId: true, building: { select: { name: true } } } },
    },
  });

type Loaded = NonNullable<Awaited<ReturnType<typeof loadForRouting>>>;

/** What still blocks sending it on, in office words. Empty when it can go. */
async function blockers(r: Loaded): Promise<string[]> {
  const out: string[] = [];
  const unpriced = r.items.filter((i) => i.unitChargeCents == null || i.unitSubPayCents == null).length;
  if (unpriced) out.push(unpriced === 1 ? "1 line needs a price" : `${unpriced} lines need a price`);
  if (!(await propertyManagerEmailsFor(r.project.buildingId)).length) out.push("No property manager email for this building");
  return out;
}

async function emailOfficeReview(r: Loaded, reasons: string[]) {
  const path = subCoRequestsPath(r.project.id);
  const url = appUrl() ? `${appUrl()}${path}` : null;
  const money = (c: number | null) => (c == null ? "<em>needs a price</em>" : escapeHtml(centsToDollars(c)));
  const rows = r.items
    .map(
      (i) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${i.quantity > 1 ? `${i.quantity} × ` : ""}${escapeHtml(i.label)}${i.description ? `: ${escapeHtml(i.description)}` : ""}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${money(i.unitSubPayCents)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${money(i.unitChargeCents)}</td></tr>`,
    )
    .join("");
  const building = r.project.building?.name;
  await sendEmail({
    type: "SUB_CO_REVIEW",
    link: path,
    subject: `Sub change order to review: ${r.project.jobTitle}`,
    html: `
      <h2 style="margin:0 0 12px;color:#E73C6E">Sub change order to review</h2>
      <p><strong>${escapeHtml(r.contractor.name)}</strong> asked for a change order on <strong>${escapeHtml(r.project.jobTitle)}</strong>${building && !r.project.jobTitle.includes(building) ? ` (${escapeHtml(building)})` : ""}.</p>
      <p><strong>Why it's waiting:</strong> ${escapeHtml(reasons.join(". "))}.</p>
      <table style="border-collapse:collapse;font-size:14px"><tr><th style="text-align:left;padding:6px 8px">Line</th><th style="text-align:right;padding:6px 8px">Sub pay (each)</th><th style="text-align:right;padding:6px 8px">Charge (each)</th></tr>${rows}</table>
      ${r.note ? `<p style="white-space:pre-line"><strong>Sub's note:</strong> ${escapeHtml(r.note)}</p>` : ""}
      <p>${r.photos.length} photo${r.photos.length === 1 ? "" : "s"} on the unit page.</p>
      ${url ? `<p style="margin:20px 0"><a href="${escapeHtml(url)}" style="background:#E73C6E;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Review it</a></p>` : ""}
    `,
  });
}

/** Right after the sub sends it: to the office or ready for the property manager. */
export async function routeNewSubCoRequest(id: string): Promise<string | null> {
  const r = await loadForRouting(id);
  if (!r || r.status !== "SUBMITTED") return r?.status ?? null;
  await addEvent(id, r.contractor.name, `Sent by the sub (${r.items.length} line${r.items.length === 1 ? "" : "s"}, ${r.photos.length} photo${r.photos.length === 1 ? "" : "s"})`);
  const reasons = await blockers(r);
  if (reasons.length) {
    await prisma.subCoRequest.update({ where: { id }, data: { status: "OFFICE_REVIEW" } });
    await addEvent(id, "Sueep", `Waiting on the office: ${reasons.join(", ").toLowerCase()}`);
    await emailOfficeReview(r, reasons).catch((e) => console.error("Sub CO review email failed", { id }, e));
    return "OFFICE_REVIEW";
  }
  await prisma.subCoRequest.update({ where: { id }, data: { status: "READY" } });
  await addEvent(id, "Sueep", "Ready for the property manager");
  const sent = await sendToPropertyManager(id, "Sueep");
  return "ok" in sent ? "WAITING_PM" : "READY";
}

export type StaffSubCoRequest = {
  id: string;
  createdAt: string;
  status: string;
  statusLabel: string;
  subName: string;
  subEmail: string | null;
  note: string | null;
  lines: {
    id: string;
    label: string;
    description: string | null;
    per: string | null;
    quantity: number;
    unitChargeCents: number | null;
    unitSubPayCents: number | null;
  }[];
  surcharge: { id: string; label: string; percent: number } | null;
  subTotalCents: number;
  chargeTotalCents: number;
  photoIds: string[];
  events: { at: string; actor: string; text: string }[];
  cancelReason: string | null;
  /** The property manager side: when it was emailed, to whom, and their answer */
  pm: { sentAt: string | null; sentTo: string[]; answeredAt: string | null; denyReason: string | null };
  /** The change order made on approval (VOID if the answer changed to denied) */
  changeOrder: { id: string; status: string } | null;
  /** The office can record or change the property manager's answer */
  answerable: boolean;
  /** What blocks Send on (requests not yet with the property manager) */
  blockers: string[];
  editable: boolean;
};

export type SubCoTabData = {
  requests: StaffSubCoRequest[];
  surchargeOptions: { id: string; label: string; percent: number }[];
  propertyManagers: { name: string; email: string }[];
};

/** Everything on the unit's CO Requests tab. Staff only: shows both prices. */
export async function loadSubCoTab(projectId: string): Promise<SubCoTabData> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { buildingId: true, building: { select: { coPricingPackage: true } } } });
  const [rows, propertyManagers] = await Promise.all([
    prisma.subCoRequest.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: {
        items: { orderBy: { sortOrder: "asc" } },
        photos: { select: { id: true }, orderBy: { createdAt: "asc" } },
        events: { orderBy: { createdAt: "asc" } },
        contractor: { select: { name: true, email: true } },
        changeOrder: { select: { id: true, status: true } },
      },
    }),
    propertyManagerEmailsFor(project?.buildingId),
  ]);
  const pkg = getCoPricingPackage(project?.building?.coPricingPackage ?? null);
  return {
    propertyManagers,
    surchargeOptions: pkg.surcharges.filter((s) => s.active).map((s) => ({ id: s.id, label: s.label, percent: s.percent })),
    requests: rows.map((r) => {
      const editable = SUB_CO_OPEN_STATUSES.includes(r.status);
      const unpriced = r.items.filter((i) => i.unitChargeCents == null || i.unitSubPayCents == null).length;
      return {
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        status: r.status,
        statusLabel: SUB_CO_STATUS_LABEL[r.status] ?? r.status,
        subName: r.contractor.name,
        subEmail: r.contractor.email,
        note: r.note,
        lines: r.items.map((i) => ({
          id: i.id,
          label: i.label,
          description: i.description,
          per: i.per,
          quantity: i.quantity,
          unitChargeCents: i.unitChargeCents,
          unitSubPayCents: i.unitSubPayCents,
        })),
        surcharge: r.surchargeId && r.surchargePercent != null ? { id: r.surchargeId, label: r.surchargeLabel ?? r.surchargeId, percent: r.surchargePercent } : null,
        subTotalCents: r.subTotalCents,
        chargeTotalCents: r.chargeTotalCents,
        photoIds: r.photos.map((p) => p.id),
        events: r.events.map((e) => ({ at: e.createdAt.toISOString(), actor: e.actor, text: e.text })),
        cancelReason: r.cancelReason,
        changeOrder: r.changeOrder,
        answerable: ["READY", "WAITING_PM", "APPROVED", "DENIED"].includes(r.status) && unpriced === 0,
        pm: { sentAt: r.pmSentAt?.toISOString() ?? null, sentTo: r.pmSentTo, answeredAt: r.pmAnsweredAt?.toISOString() ?? null, denyReason: r.pmDenyReason },
        blockers: editable && r.status !== "WAITING_PM"
          ? [
              ...(unpriced ? [unpriced === 1 ? "1 line needs a price" : `${unpriced} lines need a price`] : []),
              ...(propertyManagers.length ? [] : ["No property manager email for this building"]),
            ]
          : [],
        editable,
      };
    }),
  };
}

type Fail = { error: string };

export type SubCoUpdateInput = {
  lines?: { id: string; quantity?: number; unitChargeCents?: number | null; unitSubPayCents?: number | null; remove?: boolean }[];
  /** null removes the surcharge; leave out to keep it */
  surchargeId?: string | null;
};

function readCents(v: unknown): number | null | "bad" {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > MAX_CENTS) return "bad";
  return Math.round(n);
}

/** Office edits: prices, quantities, removed lines, surcharge. */
export async function updateSubCoRequest(id: string, actor: string, input: SubCoUpdateInput): Promise<Fail | { ok: true; warning?: string }> {
  const r = await prisma.subCoRequest.findUnique({
    where: { id },
    include: { items: { orderBy: { sortOrder: "asc" } }, project: { select: { building: { select: { coPricingPackage: true } } } } },
  });
  if (!r) return { error: "Not found" };
  if (!SUB_CO_OPEN_STATUSES.includes(r.status)) return { error: "This request can't be changed anymore." };

  const changes: string[] = [];
  const updates: { id: string; data: { quantity: number; unitChargeCents: number | null; unitSubPayCents: number | null } }[] = [];
  const removeIds: string[] = [];
  const byId = new Map(r.items.map((i) => [i.id, i]));
  for (const edit of input.lines ?? []) {
    const item = byId.get(edit.id);
    if (!item) return { error: "A line wasn't found. Reload the page." };
    const name = item.description ? `Other (${item.description.slice(0, 40)})` : item.label;
    if (edit.remove) {
      removeIds.push(item.id);
      changes.push(`Removed ${name}`);
      continue;
    }
    const quantity = edit.quantity === undefined ? item.quantity : Math.floor(Number(edit.quantity));
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 99) return { error: "Quantity must be 1 to 99." };
    const charge = edit.unitChargeCents === undefined ? item.unitChargeCents : readCents(edit.unitChargeCents);
    const sub = edit.unitSubPayCents === undefined ? item.unitSubPayCents : readCents(edit.unitSubPayCents);
    if (charge === "bad" || sub === "bad") return { error: "Prices must be $0 to $100,000." };
    const parts: string[] = [];
    if (quantity !== item.quantity) parts.push(`quantity ${item.quantity} to ${quantity}`);
    if (charge !== item.unitChargeCents) parts.push(`charge ${centsToDollars(item.unitChargeCents)} to ${centsToDollars(charge)}`);
    if (sub !== item.unitSubPayCents) parts.push(`sub pay ${centsToDollars(item.unitSubPayCents)} to ${centsToDollars(sub)}`);
    if (parts.length) {
      updates.push({ id: item.id, data: { quantity, unitChargeCents: charge, unitSubPayCents: sub } });
      changes.push(`${name}: ${parts.join(", ")}`);
    }
  }
  if (removeIds.length >= r.items.length) return { error: "Keep at least one line, or cancel the request." };

  let surcharge: { surchargeId: string | null; surchargeLabel: string | null; surchargePercent: number | null } | null = null;
  if (input.surchargeId !== undefined && (input.surchargeId ?? null) !== r.surchargeId) {
    if (input.surchargeId === null) {
      surcharge = { surchargeId: null, surchargeLabel: null, surchargePercent: null };
      changes.push(`Removed the ${r.surchargeLabel ?? ""} surcharge`.replace("  ", " "));
    } else {
      const option = getCoPricingPackage(r.project.building?.coPricingPackage ?? null).surcharges.find((s) => s.id === input.surchargeId && s.active);
      if (!option) return { error: "That surcharge isn't offered for this building." };
      surcharge = { surchargeId: option.id, surchargeLabel: option.label, surchargePercent: option.percent };
      changes.push(`Added the ${option.label} surcharge (+${option.percent}%)`);
    }
  }
  if (!changes.length) return { ok: true };

  const items = r.items
    .filter((i) => !removeIds.includes(i.id))
    .map((i) => ({ ...i, ...(updates.find((u) => u.id === i.id)?.data ?? {}) }));
  const withPm = r.status === "READY" || r.status === "WAITING_PM";
  if (withPm && items.some((i) => i.unitChargeCents == null || i.unitSubPayCents == null)) {
    return { error: "Every line needs a price once it's going to the property manager." };
  }
  const totals = subCoTotals(items, surcharge ? surcharge.surchargePercent : r.surchargePercent);
  await prisma.$transaction([
    ...updates.map((u) => prisma.subCoRequestItem.update({ where: { id: u.id }, data: u.data })),
    ...(removeIds.length ? [prisma.subCoRequestItem.deleteMany({ where: { id: { in: removeIds }, requestId: id } })] : []),
    prisma.subCoRequest.update({ where: { id }, data: { ...totals, ...(surcharge ?? {}) } }),
    prisma.subCoRequestEvent.create({ data: { requestId: id, actor, text: changes.join(". ") } }),
  ]);
  // Already with the property manager: they get the new prices
  if (r.status === "WAITING_PM") {
    const sent = await sendToPropertyManager(id, actor, { updated: true });
    if ("error" in sent) return { ok: true, warning: `Saved, but ${sent.error.charAt(0).toLowerCase()}${sent.error.slice(1)}` };
  }
  return { ok: true };
}

/** Office sends it to the property manager once every line is priced, or emails it again. */
export async function sendOnSubCoRequest(id: string, actor: string): Promise<Fail | { ok: true }> {
  const r = await loadForRouting(id);
  if (!r) return { error: "Not found" };
  if (["SUBMITTED", "OFFICE_REVIEW"].includes(r.status)) {
    const reasons = await blockers(r);
    if (reasons.length) return { error: `${reasons.join(". ")}.` };
    const done = await prisma.subCoRequest.updateMany({ where: { id, status: r.status }, data: { status: "READY" } });
    if (!done.count) return { error: "It just changed. Reload the page." };
    await addEvent(id, actor, "Sent on for the property manager");
  } else if (!["READY", "WAITING_PM"].includes(r.status)) {
    return { error: "This request can't be sent anymore." };
  }
  return sendToPropertyManager(id, actor);
}

/** Office cancels it; the sub is emailed in their language. */
export async function cancelSubCoRequest(id: string, actor: string, reasonRaw: string | null): Promise<Fail | { ok: true }> {
  const r = await loadForRouting(id);
  if (!r) return { error: "Not found" };
  if (!SUB_CO_OPEN_STATUSES.includes(r.status)) return { error: "This request can't be cancelled anymore." };
  const reason = reasonRaw?.trim().slice(0, 500) || null;
  const done = await prisma.subCoRequest.updateMany({ where: { id, status: r.status }, data: { status: "CANCELLED", cancelReason: reason } });
  if (!done.count) return { error: "It just changed. Reload the page." };
  await addEvent(id, actor, reason ? `Cancelled: ${reason}` : "Cancelled");
  if (r.contractor.email) {
    const lang = parseLang(r.contractor.language);
    const t = (en: string, es: string) => tr(lang, { en, es });
    const unit = escapeHtml(r.project.jobTitle);
    await sendEmail({
      type: "SUB_CO_CANCELLED",
      to: r.contractor.email,
      lang,
      link: subCoRequestsPath(r.project.id),
      subject: t(`Change order request cancelled: ${r.project.jobTitle}`, `Solicitud de orden de cambio cancelada: ${r.project.jobTitle}`),
      html: `<p>${t(`The office cancelled your change order request for <strong>${unit}</strong>. Don't do that extra work.`, `La oficina canceló tu solicitud de orden de cambio para <strong>${unit}</strong>. No hagas ese trabajo extra.`)}</p>${
        reason ? `<p><strong>${t("Reason", "Motivo")}:</strong> ${escapeHtml(reason)}</p>` : ""
      }<p>${t("Questions? Call the office.", "¿Preguntas? Llama a la oficina.")}</p>`,
    }).catch((e) => console.error("Sub CO cancelled email failed", { id }, e));
  }
  return { ok: true };
}

/**
 * The office records the property manager's answer (e.g. they called), or
 * changes an answer. Approving makes the change order; switching an approved
 * one to denied voids it. The sub and the team are emailed either way.
 */
export async function setSubCoAnswerByOffice(id: string, actor: string, answer: "APPROVED" | "DENIED", reasonRaw: string | null): Promise<Fail | { ok: true }> {
  const r = await prisma.subCoRequest.findUnique({
    where: { id },
    include: { items: true, changeOrder: { select: { status: true, billingStatus: true, completedAt: true } } },
  });
  if (!r) return { error: "Not found" };
  if (!["READY", "WAITING_PM", "APPROVED", "DENIED"].includes(r.status)) {
    return { error: r.status === "CANCELLED" ? "This request was cancelled." : "Price every line and send it first." };
  }
  if (r.status === answer) return { ok: true };
  if (r.items.some((i) => i.unitChargeCents == null || i.unitSubPayCents == null)) return { error: "Every line needs a price first." };
  if (answer === "DENIED") {
    const locked = answerLockedReason(r.changeOrder);
    if (locked) return { error: locked };
  }
  const changed = r.status === "APPROVED" || r.status === "DENIED";
  const reason = answer === "DENIED" ? reasonRaw?.trim().slice(0, 500) || null : null;
  const done = await prisma.subCoRequest.updateMany({ where: { id, status: r.status }, data: { status: answer, pmAnsweredAt: new Date(), pmDenyReason: reason } });
  if (!done.count) return { error: "It just changed. Reload the page." };
  const verb = answer === "APPROVED" ? "approved" : "denied";
  await addEvent(id, actor, `${changed ? `Changed the answer to ${verb}` : `Marked ${verb} for the property manager`}${reason ? `: ${reason}` : ""}`);
  await applySubCoAnswer(id, actor, { changed });
  return { ok: true };
}
