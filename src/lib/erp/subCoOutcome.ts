/**
 * What happens once a sub change order request is answered, by the property
 * manager (subCoApproval.ts) or by the office changing the answer
 * (subCoRequestReview.ts):
 * - Approved: an APPROVED change order on the unit, priced at our charge,
 *   with the sub as its contractor and their pay as the cost (so margin,
 *   finance and payroll pick it up). The sub is told their pay.
 * - Denied: the sub is told not to do it. If it had been approved, that change
 *   order is voided and the sub's cost line removed (payroll counts contractor
 *   cost lines whatever the change order's status).
 * The team gets a summary with both prices either way.
 */
import { prisma } from "@/lib/prisma";
import { escapeHtml, sendEmail } from "@/lib/email";
import { centsToDollars } from "./money";
import { parseLang, tr } from "./language";
import { todayEasternKey } from "./dates";

/** The unit page tab for requests, as an ERP path. */
export function subCoRequestsPath(projectId: string): string {
  return `/erp/projects/${projectId}?tab=${encodeURIComponent("CO Requests")}`;
}

function appUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  return /your-vercel-domain/.test(base) ? "" : base;
}

const load = (id: string) =>
  prisma.subCoRequest.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      contractor: { select: { id: true, name: true, email: true, language: true } },
      project: { select: { id: true, jobTitle: true, building: { select: { name: true } } } },
      changeOrder: { select: { id: true, status: true, billingStatus: true, completedAt: true } },
    },
  });

type Loaded = NonNullable<Awaited<ReturnType<typeof load>>>;

function lineName(i: Loaded["items"][number], lang: "en" | "es" = "en"): string {
  const label = lang === "es" && i.labelEs ? i.labelEs : i.label;
  return i.description ? `${label}: ${i.description}` : label;
}

/** Can the answer still change without touching billing? Null when yes, else why not. */
export function answerLockedReason(co: { status: string; billingStatus: string | null; completedAt: Date | null } | null): string | null {
  if (!co || co.status === "VOID") return null;
  if (co.billingStatus || co.completedAt || co.status === "COMPLETED") return "Its change order is already completed or billed. Change it on the Change Orders tab instead.";
  return null;
}

async function createChangeOrder(r: Loaded): Promise<string> {
  const conf = await prisma.scheduleConfirmation.findUnique({ where: { uid: r.confirmationUid }, select: { dateKey: true } });
  const today = todayEasternKey();
  // Booked on the turn's day, or today if it's approved after that
  const workKey = conf?.dateKey && conf.dateKey > today ? conf.dateKey : today;
  const workDate = new Date(`${workKey}T00:00:00.000Z`);
  const names = r.items.map((i) => (i.quantity > 1 ? `${i.quantity}x ${i.description ? "Other" : i.label}` : i.description ? "Other" : i.label));
  const title = `Sub change order: ${names.join(", ")}`.slice(0, 150);
  const description = [
    ...r.items.map((i) => `${i.quantity > 1 ? `${i.quantity} x ` : ""}${lineName(i)}: ${centsToDollars((i.unitChargeCents ?? 0) * i.quantity)}`),
    ...(r.surchargePercent ? [`${r.surchargeLabel ?? "Surcharge"} (+${r.surchargePercent}%)`] : []),
    ...(r.note ? [`Sub's note: ${r.note}`] : []),
  ].join("\n");
  const co = await prisma.$transaction(async (tx) => {
    const created = await tx.projectChangeOrder.create({
      data: {
        projectId: r.project.id,
        title,
        description,
        status: "APPROVED",
        requestedBy: r.contractor.name,
        reason: "Found by the sub on the turnover, approved by the property manager",
        contractValueCents: r.chargeTotalCents,
        noCrewRequired: true,
      },
      select: { id: true },
    });
    await tx.changeOrderContractorAssignment.create({
      data: { changeOrderId: created.id, contractorId: r.contractor.id, role: "Sub", costCents: r.subTotalCents, endDate: workDate, notes: "From the sub's change order request" },
    });
    await tx.subCoRequest.update({ where: { id: r.id }, data: { changeOrderId: created.id } });
    return created;
  });
  return co.id;
}

async function voidChangeOrder(r: Loaded): Promise<boolean> {
  if (!r.changeOrder || r.changeOrder.status === "VOID") return false;
  await prisma.$transaction([
    prisma.projectChangeOrder.update({ where: { id: r.changeOrder.id }, data: { status: "VOID" } }),
    prisma.changeOrderContractorAssignment.deleteMany({ where: { changeOrderId: r.changeOrder.id, contractorId: r.contractor.id } }),
  ]);
  return true;
}

async function emailSub(r: Loaded, approved: boolean, changed: boolean) {
  if (!r.contractor.email) return;
  const lang = parseLang(r.contractor.language);
  const t = (en: string, es: string) => tr(lang, { en, es });
  const unit = escapeHtml(r.project.jobTitle);
  let html: string;
  if (approved) {
    const base = r.items.reduce((s, i) => s + (i.unitSubPayCents ?? 0) * i.quantity, 0);
    const rows = [
      ...r.items.map((i) => `<tr><td style="padding:4px 8px">${i.quantity > 1 ? `${i.quantity} × ` : ""}${escapeHtml(lineName(i, lang))}</td><td style="padding:4px 8px;text-align:right">${escapeHtml(centsToDollars((i.unitSubPayCents ?? 0) * i.quantity))}</td></tr>`),
      ...(r.surchargePercent ? [`<tr><td style="padding:4px 8px">${escapeHtml(r.surchargeLabel ?? "")} (+${r.surchargePercent}%)</td><td style="padding:4px 8px;text-align:right">${escapeHtml(centsToDollars(r.subTotalCents - base))}</td></tr>`] : []),
    ].join("");
    html = `<p>${t(`Your change order for <strong>${unit}</strong> was <strong>approved</strong>. Go ahead with the work.`, `Tu orden de cambio para <strong>${unit}</strong> fue <strong>aprobada</strong>. Puedes hacer el trabajo.`)}</p>
      <table style="border-collapse:collapse;font-size:14px">${rows}<tr><td style="padding:6px 8px"><strong>${t("Your pay", "Tu pago")}</strong></td><td style="padding:6px 8px;text-align:right"><strong>${escapeHtml(centsToDollars(r.subTotalCents))}</strong></td></tr></table>
      <p>${t("It's added to your pay for this unit.", "Se suma a tu pago por esta unidad.")}</p>`;
  } else {
    html = `<p>${t(
      `${changed ? "Change: your" : "Your"} change order for <strong>${unit}</strong> was <strong>not approved</strong>. Don't do this extra work.`,
      `${changed ? "Cambio: tu" : "Tu"} orden de cambio para <strong>${unit}</strong> <strong>no fue aprobada</strong>. No hagas este trabajo extra.`,
    )}</p>${r.pmDenyReason ? `<p><strong>${t("Reason", "Motivo")}:</strong> ${escapeHtml(r.pmDenyReason)}</p>` : ""}<p>${t("Questions? Call the office.", "¿Preguntas? Llama a la oficina.")}</p>`;
  }
  await sendEmail({
    type: "SUB_CO_ANSWERED",
    to: r.contractor.email,
    lang,
    link: subCoRequestsPath(r.project.id),
    subject: approved
      ? t(`Approved: change order for ${r.project.jobTitle}`, `Aprobada: orden de cambio para ${r.project.jobTitle}`)
      : t(`Not approved: change order for ${r.project.jobTitle}`, `No aprobada: orden de cambio para ${r.project.jobTitle}`),
    html,
  });
}

async function emailTeam(r: Loaded, approved: boolean, actor: string, changeOrderId: string | null) {
  const cell = "padding:6px 8px;border-bottom:1px solid #eee";
  const rows = r.items
    .map(
      (i) =>
        `<tr><td style="${cell}">${i.quantity > 1 ? `${i.quantity} × ` : ""}${escapeHtml(lineName(i))}</td><td style="${cell};text-align:right">${escapeHtml(centsToDollars((i.unitChargeCents ?? 0) * i.quantity))}</td><td style="${cell};text-align:right">${escapeHtml(centsToDollars((i.unitSubPayCents ?? 0) * i.quantity))}</td></tr>`,
    )
    .join("");
  const surcharge = r.surchargePercent ? `<p>${escapeHtml(r.surchargeLabel ?? "Surcharge")} surcharge: +${r.surchargePercent}% on both.</p>` : "";
  const base = appUrl();
  const coPath = changeOrderId ? `/erp/projects/${r.project.id}/change-orders/${changeOrderId}` : subCoRequestsPath(r.project.id);
  const building = r.project.building?.name;
  await sendEmail({
    type: "SUB_CO_ANSWERED_TEAM",
    link: coPath,
    subject: `${approved ? "Approved" : "Denied"}: sub change order, ${r.project.jobTitle}`,
    html: `
      <h2 style="margin:0 0 12px;color:#E73C6E">Sub change order ${approved ? "approved" : "denied"}</h2>
      <p><strong>${escapeHtml(actor)}</strong> ${approved ? "approved" : "denied"} ${escapeHtml(r.contractor.name)}'s change order on <strong>${escapeHtml(r.project.jobTitle)}</strong>${building && !r.project.jobTitle.includes(building) ? ` (${escapeHtml(building)})` : ""}.</p>
      ${!approved && r.pmDenyReason ? `<p><strong>Reason:</strong> ${escapeHtml(r.pmDenyReason)}</p>` : ""}
      <table style="border-collapse:collapse;font-size:14px"><tr><th style="text-align:left;padding:6px 8px">Line</th><th style="text-align:right;padding:6px 8px">Charge</th><th style="text-align:right;padding:6px 8px">Sub pay</th></tr>${rows}
      <tr><td style="padding:6px 8px"><strong>Total</strong></td><td style="padding:6px 8px;text-align:right"><strong>${escapeHtml(centsToDollars(r.chargeTotalCents))}</strong></td><td style="padding:6px 8px;text-align:right"><strong>${escapeHtml(centsToDollars(r.subTotalCents))}</strong></td></tr></table>
      ${surcharge}
      <p>Margin: <strong>${escapeHtml(centsToDollars(r.chargeTotalCents - r.subTotalCents))}</strong></p>
      ${approved ? "<p>The change order was added to the unit, with the sub's pay as its cost. The sub was told to go ahead.</p>" : "<p>The sub was told not to do it.</p>"}
      ${base ? `<p style="margin:20px 0"><a href="${escapeHtml(base + coPath)}" style="background:#E73C6E;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">${approved ? "Open the change order" : "Open the request"}</a></p>` : ""}
    `,
  });
}

/**
 * Runs after the status became APPROVED or DENIED. `changed` is true when the
 * office flipped an earlier answer. Emails never block the change order work.
 */
export async function applySubCoAnswer(id: string, actor: string, opts: { changed?: boolean } = {}): Promise<void> {
  const r = await load(id);
  if (!r || (r.status !== "APPROVED" && r.status !== "DENIED")) return;
  const approved = r.status === "APPROVED";
  let changeOrderId = r.changeOrder && r.changeOrder.status !== "VOID" ? r.changeOrder.id : null;
  if (approved && !changeOrderId) {
    changeOrderId = await createChangeOrder(r);
    await prisma.subCoRequestEvent.create({ data: { requestId: id, actor: "Sueep", text: "Change order added to the unit, with the sub's pay as its cost" } });
  } else if (!approved && (await voidChangeOrder(r))) {
    changeOrderId = null;
    await prisma.subCoRequestEvent.create({ data: { requestId: id, actor: "Sueep", text: "Change order voided and the sub's cost removed" } });
  }
  await emailSub(r, approved, !!opts.changed).catch((e) => console.error("Sub CO answer email (sub) failed", { id }, e));
  await emailTeam(r, approved, actor, changeOrderId).catch((e) => console.error("Sub CO answer email (team) failed", { id }, e));
}
