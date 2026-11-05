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
 *
 * Invoices the ERP made in QuickBooks (ERP_QBO_INVOICING_PLAN.md Phase 4)
 * go the same way, with QuickBooks' PDF attached. A sandbox (local dev)
 * Approve only emails the approver a test copy (emailSandboxTest).
 */
import { prisma } from "@/lib/prisma";
import { buildInvoiceSentBackEmail, escapeHtml, sendEmail } from "@/lib/email";
import { DAILY_EMAIL_LIMIT, loadEmailQuota } from "./emailQuota";
import { centsToDollars } from "./money";
import { BILLING_METHOD_LABELS, PORTAL_METHODS, type BillingMethod } from "./clientCompanies";
import { loadBuildingInvoiceDestination, loadProjectInvoiceDestination, withDraftRecipients, type DraftRecipients, type InvoiceDestination } from "./invoiceDestination";
import { qboGetPdf } from "./qboClient";
import { namesByEmail } from "./janitorialQualityChecks";
import { PORTAL_PICKABLE, isPortalStatus, type PortalStatus } from "./portalStatus";

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
  /** Recipients set on the draft, which replace the billing settings' Send to and cc */
  recipients?: DraftRecipients | null;
  /** One of these two is set */
  hubspotInvoiceId: string | null;
  qboInvoiceId?: string | null;
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

/** The invoice's PDF: QuickBooks' own for ERP invoices, else HubSpot's. Null if it can't be had. */
async function invoicePdf(inv: InvoiceForDelivery): Promise<Buffer | null> {
  if (inv.qboInvoiceId) return qboGetPdf(`/invoice/${encodeURIComponent(inv.qboInvoiceId)}/pdf`).catch(() => null);
  return fetchPdf(inv.pdfUrl);
}

/** Emails one invoice if the plan says email; returns null on success or the reason it wasn't sent. */
async function emailInvoice(
  inv: InvoiceForDelivery,
  dest: InvoiceDestination | null,
  plan: Extract<DeliveryPlan, { kind: "EMAIL" }>,
  replyTo: string,
  test?: { banner: string },
): Promise<string | null> {
  const quota = await loadEmailQuota();
  if (quota.used + plan.to.length + plan.cc.length > DAILY_EMAIL_LIMIT) return "Daily email limit reached. Email again after it resets.";
  const pdf = await invoicePdf(inv);
  try {
    const status = await sendEmail({
      type: test ? "INVOICE_PREVIEW" : "INVOICE_TO_CLIENT",
      to: plan.to,
      cc: plan.cc,
      replyTo,
      subject: `${test ? "[Sandbox test] " : ""}Invoice ${inv.number ?? ""} from Sueep: ${inv.title}`.replace(/\s+/g, " "),
      html: (test?.banner ?? "") + invoiceEmailHtml(inv, dest?.company?.name ?? null, !!pdf),
      attachments: pdf ? [{ filename: `Sueep invoice ${inv.number ?? inv.qboInvoiceId ?? inv.hubspotInvoiceId}.pdf`, content: pdf, mimeType: "application/pdf" }] : undefined,
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
    dest = withDraftRecipients(await loadDestination(inv.destType, inv.destId), inv.recipients);
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
  // QuickBooks invoices keep their lines and due date here; HubSpot ones read them from the link tables.
  const qbo = inv.qboInvoiceId ? { lines: inv.lines, dueDate: inv.dueDate ? new Date(inv.dueDate) : null } : {};
  await prisma.invoiceDelivery.upsert({
    where: inv.qboInvoiceId ? { qboInvoiceId: inv.qboInvoiceId } : { hubspotInvoiceId: inv.hubspotInvoiceId! },
    create: { hubspotInvoiceId: inv.hubspotInvoiceId, qboInvoiceId: inv.qboInvoiceId ?? null, ...qbo, ...base, ...row },
    update: { ...qbo, ...base, ...row },
  });
  if (row.status === "EMAILED") return `Emailed to ${row.sentTo.join(", ")}.`;
  if (row.status === "NEEDS_UPLOAD") return `On Needs upload (${row.reason}).`;
  return `On Needs sending: ${row.reason}`;
}

/**
 * Sandbox Approve: emails only the approver what the client would get, with
 * the sandbox PDF, and says where the real one would go. No delivery row,
 * so nothing lands on the live Needs sending list.
 */
export async function emailSandboxTest(inv: InvoiceForDelivery, approverEmail: string): Promise<string> {
  const dest = withDraftRecipients(await loadDestination(inv.destType, inv.destId).catch(() => null), inv.recipients);
  const banner =
    `<div style="background:#e0f2fe;border:1px solid #7dd3fc;border-radius:6px;padding:10px 12px;margin-bottom:16px;font-size:13px;color:#0c4a6e">` +
    `<strong>Sandbox test.</strong> Made in the QuickBooks sandbox company and sent only to you. On the live site: ${escapeHtml(describePlan(planDelivery(dest)))}</div>`;
  const failed = await emailInvoice(inv, dest, { kind: "EMAIL", to: [approverEmail], cc: [] }, approverEmail, { banner });
  return failed ? `Test email not sent: ${failed}` : `Test copy emailed to you.`;
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
    qboInvoiceId: d.qboInvoiceId,
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

export type DeliveryDoneDetails = {
  portalReference: string | null;
  note: string | null;
  proof: { filename: string; mimeType: string; data: Buffer } | null;
};

/** Uploaded to the portal, or sent some other way by hand, with the portal's number, a note and a proof file. */
export async function markDeliveryDone(deliveryId: string, email: string, details: DeliveryDoneDetails): Promise<{ ok: true } | { error: string }> {
  const d = await prisma.invoiceDelivery.findUnique({ where: { id: deliveryId }, select: { status: true } });
  if (!d || (d.status !== "NEEDS_UPLOAD" && d.status !== "NEEDS_SENDING")) return { error: "This one isn't waiting anymore." };
  if (d.status === "NEEDS_UPLOAD" && !details.portalReference && !details.proof) {
    return { error: "Add the portal's number or a screenshot, so there's proof it was uploaded." };
  }
  const uploaded = d.status === "NEEDS_UPLOAD";
  const now = new Date();
  const done = await prisma.$transaction(async (tx) => {
    const { count } = await tx.invoiceDelivery.updateMany({
      where: { id: deliveryId, status: d.status },
      data: {
        status: "DONE",
        doneAs: uploaded ? "UPLOADED" : "SENT",
        doneAt: now,
        doneByEmail: email,
        portalReference: details.portalReference,
        doneNote: details.note,
        ...(uploaded ? { portalStatus: "SUBMITTED", portalStatusAt: now } : {}),
      },
    });
    if (count !== 1) return false;
    if (details.proof) await tx.invoiceDeliveryProof.create({ data: { deliveryId, ...details.proof, uploadedByEmail: email } });
    if (uploaded) {
      await tx.invoiceDeliveryStatusChange.create({
        data: { deliveryId, toStatus: "SUBMITTED", note: details.note, portalReference: details.portalReference, byEmail: email },
      });
    }
    return true;
  });
  return done ? { ok: true } : { error: "This one isn't waiting anymore." };
}

/**
 * Under review, Approved or Sent back, picked on the Invoices page after
 * checking the portal. Sent back needs the reason and emails the uploader,
 * and the invoice goes back on Ready to send to resubmit.
 */
export async function setPortalStatus(deliveryId: string, email: string, status: unknown, note: string | null): Promise<{ ok: true } | { error: string }> {
  if (!isPortalStatus(status) || !PORTAL_PICKABLE.includes(status)) return { error: "Pick Under review, Approved or Sent back." };
  if (status === "SENT_BACK" && !note) return { error: "Say why the client sent it back." };
  const d = await prisma.invoiceDelivery.findUnique({
    where: { id: deliveryId },
    select: { doneAs: true, portalStatus: true, invoiceNumber: true, title: true, clientName: true, method: true, doneByEmail: true },
  });
  if (!d || d.doneAs !== "UPLOADED") return { error: "Only invoices uploaded to a portal have a portal status." };
  if (d.portalStatus === status) return { ok: true };
  const now = new Date();
  await prisma.$transaction([
    prisma.invoiceDelivery.update({
      where: { id: deliveryId },
      data: { portalStatus: status, portalStatusAt: now, sentBackReason: status === "SENT_BACK" ? note : null },
    }),
    prisma.invoiceDeliveryStatusChange.create({ data: { deliveryId, fromStatus: d.portalStatus, toStatus: status, note, byEmail: email } }),
  ]);

  if (status === "SENT_BACK") {
    const names = await namesByEmail([email]);
    const portal = d.method && d.method in BILLING_METHOD_LABELS ? BILLING_METHOD_LABELS[d.method as BillingMethod] : "the portal";
    const link = "/erp/ready-to-send";
    const invoice = d.invoiceNumber ? `${d.invoiceNumber}, ${d.title}` : d.title;
    await sendEmail({
      type: "INVOICE_SENT_BACK",
      to: d.doneByEmail ?? [],
      link,
      subject: `Sent back in ${portal}: ${invoice}`,
      html: buildInvoiceSentBackEmail({
        invoice,
        client: d.clientName,
        portal,
        reason: note!,
        by: names.get(email.toLowerCase()) ?? email.split("@")[0]!,
        url: `${(process.env.NEXT_PUBLIC_APP_URL?.trim() || "").replace(/\/$/, "")}${link}`,
      }),
    }).catch((e) => console.error("Invoice sent back email failed:", e));
  }
  return { ok: true };
}

/** Fixed and uploaded again after the client sent it back, with the new portal number or proof. */
export async function resubmitDelivery(deliveryId: string, email: string, details: DeliveryDoneDetails): Promise<{ ok: true } | { error: string }> {
  if (!details.portalReference && !details.proof) return { error: "Add the portal's number or a screenshot, so there's proof it was resubmitted." };
  const now = new Date();
  const done = await prisma.$transaction(async (tx) => {
    const { count } = await tx.invoiceDelivery.updateMany({
      where: { id: deliveryId, portalStatus: "SENT_BACK" },
      data: {
        portalStatus: "RESUBMITTED" satisfies PortalStatus,
        portalStatusAt: now,
        sentBackReason: null,
        ...(details.portalReference ? { portalReference: details.portalReference } : {}),
      },
    });
    if (count !== 1) return false;
    if (details.proof) await tx.invoiceDeliveryProof.create({ data: { deliveryId, ...details.proof, uploadedByEmail: email } });
    await tx.invoiceDeliveryStatusChange.create({
      data: { deliveryId, fromStatus: "SENT_BACK", toStatus: "RESUBMITTED", note: details.note, portalReference: details.portalReference, byEmail: email },
    });
    return true;
  });
  return done ? { ok: true } : { error: "This one isn't sent back anymore." };
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
