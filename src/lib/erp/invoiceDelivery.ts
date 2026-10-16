/**
 * Getting an approved invoice to the client (DEALS_BILLING_PLAN Phase 4).
 *
 * Runs right after Approve. Where it goes comes from invoiceDestination.ts
 * (project override, building override, client company):
 * - Email or RealPage email inbox with a Send to: emailed from Sueep's
 *   address with HubSpot's PDF attached and its view/pay link, replies to the
 *   approver, logged in the Email Log (INVOICE_TO_CLIENT).
 * - Procore, Coupa, vendor portal: Needs upload, with the portal link and
 *   the numbers to type.
 * - Anything else (no Send to, method Other, daily email limit reached, send
 *   failed): Needs sending, with the reason.
 * Each invoice gets one InvoiceDelivery row; Needs upload and Needs sending
 * stay on Ready to send until someone marks them done or emails again.
 */
import { prisma } from "@/lib/prisma";
import { escapeHtml, sendEmail } from "@/lib/email";
import { DAILY_EMAIL_LIMIT, loadEmailQuota } from "./emailQuota";
import { centsToDollars } from "./money";
import { BILLING_METHOD_LABELS, PORTAL_METHODS, type BillingMethod } from "./clientCompanies";
import { loadBuildingInvoiceDestination, loadProjectInvoiceDestination, type InvoiceDestination } from "./invoiceDestination";

export type DeliveryPlan =
  | { kind: "EMAIL"; to: string[]; cc: string[] }
  | { kind: "UPLOAD"; method: BillingMethod; portalUrl: string | null }
  | { kind: "MANUAL"; reason: string };

export function planDelivery(d: InvoiceDestination | null): DeliveryPlan {
  const method = d?.method.value ?? null;
  const to = d?.sendTo.value ?? [];
  if (method && (PORTAL_METHODS as readonly string[]).includes(method)) return { kind: "UPLOAD", method, portalUrl: d?.portalUrl.value ?? null };
  if (method === "OTHER") return { kind: "MANUAL", reason: "Billing method is Other" };
  if (!to.length) return { kind: "MANUAL", reason: method ? "No Send to address" : "No billing method or Send to set" };
  return { kind: "EMAIL", to, cc: d?.cc.value ?? [] };
}

/** One line for the Approve confirm box. */
export function describePlan(p: DeliveryPlan): string {
  if (p.kind === "EMAIL") return `Emails it to ${p.to.join(", ")}${p.cc.length ? `, cc ${p.cc.join(", ")}` : ""}.`;
  if (p.kind === "UPLOAD") return `Goes on Needs upload (${BILLING_METHOD_LABELS[p.method]}).`;
  return `Goes on Needs sending: ${p.reason}.`;
}

export type InvoiceForDelivery = {
  hubspotInvoiceId: string;
  number: string | null;
  title: string;
  totalCents: number;
  dueDate: string | null;
  viewUrl: string | null;
  pdfUrl: string | null;
  lines: { name: string; description: string; amountCents: number }[];
  destType: "BUILDING" | "PROJECT";
  destId: string;
  link: string;
};

async function loadDestination(destType: string, destId: string) {
  return destType === "PROJECT" ? loadProjectInvoiceDestination(destId) : loadBuildingInvoiceDestination(destId);
}

/** HubSpot's PDF, which can take a moment to exist after opening. Null if it can't be had. */
async function fetchPdf(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      const type = res.headers.get("content-type") ?? "";
      if (res.ok && type.includes("pdf")) return Buffer.from(await res.arrayBuffer());
    } catch {
      // Try again below.
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

function fmtDue(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function invoiceEmailHtml(inv: InvoiceForDelivery, clientName: string | null, hasPdf: boolean): string {
  const rows = inv.lines
    .map(
      (l) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(l.name)}<div style="color:#6b7280;font-size:12px">${escapeHtml(l.description)}</div></td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${centsToDollars(l.amountCents)}</td></tr>`,
    )
    .join("");
  const due = fmtDue(inv.dueDate);
  return [
    `<p>Hello${clientName ? ` ${escapeHtml(clientName)}` : ""},</p>`,
    `<p>Please find invoice <strong>${escapeHtml(inv.number ?? "")}</strong> for <strong>${escapeHtml(inv.title)}</strong>: ${centsToDollars(inv.totalCents)}${due ? `, due ${due}` : ""}.</p>`,
    `<table style="border-collapse:collapse;width:100%;font-size:14px">${rows}<tr><td style="padding:8px;font-weight:bold">Total</td><td style="padding:8px;text-align:right;font-weight:bold">${centsToDollars(inv.totalCents)}</td></tr></table>`,
    inv.viewUrl
      ? `<p style="margin:20px 0"><a href="${escapeHtml(inv.viewUrl)}" style="background:#E73C6E;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">View and pay invoice</a></p>`
      : "",
    hasPdf ? `<p>The invoice PDF is attached.</p>` : "",
    `<p>Thank you,<br>Sueep</p>`,
  ].join("");
}

/** Emails one invoice if the plan says email; returns null on success or the reason it wasn't sent. */
async function emailInvoice(inv: InvoiceForDelivery, dest: InvoiceDestination | null, plan: Extract<DeliveryPlan, { kind: "EMAIL" }>, replyTo: string): Promise<string | null> {
  const quota = await loadEmailQuota();
  if (quota.used + plan.to.length + plan.cc.length > DAILY_EMAIL_LIMIT) return "Daily email limit reached. Email again after it resets.";
  const pdf = await fetchPdf(inv.pdfUrl);
  try {
    const status = await sendEmail({
      type: "INVOICE_TO_CLIENT",
      to: plan.to,
      cc: plan.cc,
      replyTo,
      subject: `Invoice ${inv.number ?? ""} from Sueep: ${inv.title}`.replace(/\s+/g, " "),
      html: invoiceEmailHtml(inv, dest?.company?.name ?? null, !!pdf),
      attachments: pdf ? [{ filename: `Sueep invoice ${inv.number ?? inv.hubspotInvoiceId}.pdf`, content: pdf, mimeType: "application/pdf" }] : undefined,
      link: inv.link,
      sentBy: replyTo,
    });
    if (status === "SENT") return null;
    if (status === "SKIPPED") return "Email isn't set up on this server, so it wasn't sent.";
    return status === "OFF" ? "Invoice emails are turned off." : "No one to send it to.";
  } catch (e) {
    return `Email failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300);
  }
}

/** Right after Approve. Never throws: problems land on Needs sending. Returns a short result for the toast. */
export async function deliverApprovedInvoice(inv: InvoiceForDelivery, approverEmail: string): Promise<string> {
  let dest: InvoiceDestination | null = null;
  try {
    dest = await loadDestination(inv.destType, inv.destId);
  } catch {
    // Treated as no destination below.
  }
  const plan = planDelivery(dest);
  const base = {
    invoiceNumber: inv.number,
    title: inv.title,
    totalCents: inv.totalCents,
    destType: inv.destType,
    destId: inv.destId,
    link: inv.link,
    clientCompanyId: dest?.company?.id ?? null,
    clientName: dest?.company?.name ?? null,
    method: dest?.method.value ?? null,
    portalUrl: dest?.portalUrl.value ?? null,
    viewUrl: inv.viewUrl,
    pdfUrl: inv.pdfUrl,
    approvedByEmail: approverEmail,
  };

  let row: { status: string; reason: string | null; sentTo: string[]; cc: string[]; emailedAt: Date | null };
  if (plan.kind === "EMAIL") {
    const failed = await emailInvoice(inv, dest, plan, approverEmail);
    row = failed
      ? { status: "NEEDS_SENDING", reason: failed, sentTo: [], cc: [], emailedAt: null }
      : { status: "EMAILED", reason: null, sentTo: plan.to, cc: plan.cc, emailedAt: new Date() };
  } else if (plan.kind === "UPLOAD") {
    row = { status: "NEEDS_UPLOAD", reason: `Upload to ${BILLING_METHOD_LABELS[plan.method]}`, sentTo: [], cc: [], emailedAt: null };
  } else {
    row = { status: "NEEDS_SENDING", reason: plan.reason, sentTo: [], cc: [], emailedAt: null };
  }
  await prisma.invoiceDelivery.upsert({
    where: { hubspotInvoiceId: inv.hubspotInvoiceId },
    create: { hubspotInvoiceId: inv.hubspotInvoiceId, ...base, ...row },
    update: { ...base, ...row },
  });
  if (row.status === "EMAILED") return `Emailed to ${row.sentTo.join(", ")}.`;
  if (row.status === "NEEDS_UPLOAD") return `On Needs upload (${row.reason}).`;
  return `On Needs sending: ${row.reason}`;
}

/** Email again after fixing the address (or the next day, past the limit). */
export async function emailAgain(deliveryId: string, email: string, lines: InvoiceForDelivery["lines"], dueDate: string | null): Promise<{ ok: true; note: string } | { error: string }> {
  const d = await prisma.invoiceDelivery.findUnique({ where: { id: deliveryId } });
  if (!d) return { error: "Not found." };
  if (d.status === "EMAILED" || d.status === "DONE") return { error: "This one is already sent." };
  const dest = await loadDestination(d.destType, d.destId);
  const plan = planDelivery(dest);
  if (plan.kind !== "EMAIL") return { error: plan.kind === "UPLOAD" ? "This client uses a portal. Upload it, then Mark done." : `${plan.reason}. Fix it on the company, building or project first.` };
  const inv: InvoiceForDelivery = {
    hubspotInvoiceId: d.hubspotInvoiceId,
    number: d.invoiceNumber,
    title: d.title,
    totalCents: d.totalCents,
    dueDate,
    viewUrl: d.viewUrl,
    pdfUrl: d.pdfUrl,
    lines,
    destType: d.destType === "PROJECT" ? "PROJECT" : "BUILDING",
    destId: d.destId,
    link: d.link ?? "/erp/ready-to-send",
  };
  const failed = await emailInvoice(inv, dest, plan, email);
  if (failed) {
    await prisma.invoiceDelivery.update({ where: { id: d.id }, data: { reason: failed } });
    return { error: failed };
  }
  await prisma.invoiceDelivery.update({ where: { id: d.id }, data: { status: "EMAILED", reason: null, sentTo: plan.to, cc: plan.cc, emailedAt: new Date() } });
  return { ok: true, note: `Emailed to ${plan.to.join(", ")}.` };
}

/** Uploaded to the portal, or sent some other way by hand. */
export async function markDeliveryDone(deliveryId: string, email: string): Promise<boolean> {
  const { count } = await prisma.invoiceDelivery.updateMany({
    where: { id: deliveryId, status: { in: ["NEEDS_UPLOAD", "NEEDS_SENDING"] } },
    data: { status: "DONE", doneAt: new Date(), doneByEmail: email },
  });
  return count === 1;
}

/** The invoice's lines and due date as the ERP has them, from whichever link table holds it. */
export async function invoiceLinesFor(hubspotInvoiceId: string): Promise<{ lines: InvoiceForDelivery["lines"]; dueDate: string | null }> {
  const [months, units, sov] = await Promise.all([
    prisma.hubSpotContractInvoice.findMany({ where: { hubspotInvoiceId }, select: { amountCents: true, dueDate: true, period: { select: { periodStart: true, recurringContract: { select: { building: { select: { name: true } } } } } } } }),
    prisma.hubSpotUnitInvoice.findMany({ where: { hubspotInvoiceId }, select: { unitNumber: true, amountCents: true, dueDate: true } }),
    prisma.hubSpotSovInvoice.findMany({ where: { hubspotInvoiceId }, select: { amountCents: true, dueDate: true, sovItem: { select: { description: true } }, changeOrder: { select: { title: true } } } }),
  ]);
  const lines = [
    ...months.map((m) => ({
      name: "Janitorial services",
      description: `${m.period.recurringContract.building.name}, ${m.period.periodStart.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}`,
      amountCents: m.amountCents,
    })),
    ...units.map((u) => ({ name: "Turn Over", description: u.unitNumber, amountCents: u.amountCents })),
    ...sov.map((s) => ({ name: s.sovItem?.description ?? s.changeOrder?.title ?? "Line", description: s.changeOrder ? "Change order" : "", amountCents: s.amountCents })),
  ];
  const due = [...months, ...units, ...sov].find((r) => r.dueDate)?.dueDate ?? null;
  return { lines, dueDate: due?.toISOString() ?? null };
}
