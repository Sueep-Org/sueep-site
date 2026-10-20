/**
 * Two extras on Ready to send drafts, for both janitorial months and picked
 * finished work:
 * - Set the due date when the client company has no payment terms (with
 *   terms, the due date is always invoice date + terms).
 * - Email me a preview: the exact client email, sent only to the person who
 *   asked, without approving anything. A draft has no PDF or pay link yet.
 */
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { todayEasternKey, utcDateKey } from "./dates";
import { loadBuildingInvoiceDestination, loadProjectInvoiceDestination, type InvoiceDestination } from "./invoiceDestination";
import { billingDateKey, draftLines, linesTotal, monthLabel } from "./janitorialInvoiceDrafts";
import { describePlan, invoiceEmailHtml, invoiceLinesFor, planDelivery, type InvoiceForDelivery } from "./invoiceDelivery";
import { setInvoiceDates } from "@/lib/hubspot/invoiceDrafts";

export type DraftKind = "month" | "items";

type LoadedDraft = {
  hubspotInvoiceId: string;
  title: string;
  invoiceDateKey: string;
  dueDateKey: string | null;
  lines: InvoiceForDelivery["lines"];
  destination: InvoiceDestination | null;
  /** Rows holding this invoice's dates, to update after a change */
  updateDue: (due: Date) => Promise<void>;
};

async function loadDraft(kind: DraftKind, rowId: string): Promise<LoadedDraft | null> {
  if (kind === "month") {
    const p = await prisma.recurringContractPeriod.findUnique({
      where: { id: rowId },
      include: {
        charges: { orderBy: { createdAt: "asc" } },
        hubspotInvoices: true,
        recurringContract: { select: { billingDayOfMonth: true, invoiceLabel: true, buildingId: true, building: { select: { name: true } } } },
      },
    });
    const link = p?.hubspotInvoices.find((i) => i.draftedByErp && i.status === "draft");
    if (!p || !link) return null;
    const label = p.recurringContract.invoiceLabel?.trim() || p.recurringContract.building.name;
    return {
      hubspotInvoiceId: link.hubspotInvoiceId,
      title: `${p.recurringContract.building.name}, ${monthLabel(p.periodStart)}`,
      invoiceDateKey: billingDateKey(p.periodStart, p.recurringContract.billingDayOfMonth),
      dueDateKey: link.dueDate ? utcDateKey(link.dueDate) : null,
      lines: draftLines(label, p),
      destination: await loadBuildingInvoiceDestination(p.recurringContract.buildingId),
      updateDue: async (due) => {
        await prisma.hubSpotContractInvoice.update({ where: { id: link.id }, data: { dueDate: due } });
      },
    };
  }
  const d = await prisma.itemInvoiceDraft.findUnique({ where: { id: rowId } });
  if (!d || d.status !== "DRAFT") return null;
  const { lines, dueDate } = await invoiceLinesFor(d.hubspotInvoiceId);
  const unit = await prisma.hubSpotUnitInvoice.findFirst({ where: { hubspotInvoiceId: d.hubspotInvoiceId }, select: { invoiceDate: true } });
  const sov = unit ? null : await prisma.hubSpotSovInvoice.findFirst({ where: { hubspotInvoiceId: d.hubspotInvoiceId }, select: { invoiceDate: true } });
  const invoiceDate = unit?.invoiceDate ?? sov?.invoiceDate ?? null;
  return {
    hubspotInvoiceId: d.hubspotInvoiceId,
    title: d.title,
    // Dated on Approve, so a due date can't be set before today.
    invoiceDateKey: [invoiceDate ? utcDateKey(invoiceDate) : todayEasternKey(d.createdAt), todayEasternKey()].sort().pop()!,
    dueDateKey: dueDate ? dueDate.slice(0, 10) : null,
    lines,
    destination: d.groupType === "PROJECT" ? await loadProjectInvoiceDestination(d.groupId) : await loadBuildingInvoiceDestination(d.groupId),
    updateDue: async (due) => {
      await prisma.$transaction([
        prisma.hubSpotUnitInvoice.updateMany({ where: { hubspotInvoiceId: d.hubspotInvoiceId }, data: { dueDate: due } }),
        prisma.hubSpotSovInvoice.updateMany({ where: { hubspotInvoiceId: d.hubspotInvoiceId }, data: { dueDate: due } }),
      ]);
    },
  };
}

/** Sets a draft's due date, in HubSpot and the ERP. Only when the company has no payment terms. */
export async function setDraftDueDate(kind: DraftKind, rowId: string, dueKey: string): Promise<{ ok: true } | { error: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueKey)) return { error: "Pick a due date." };
  const draft = await loadDraft(kind, rowId);
  if (!draft) return { error: "This draft isn't waiting anymore." };
  if (draft.destination?.paymentTermsDays != null) {
    return { error: `This client has payment terms (Net ${draft.destination.paymentTermsDays}), so the due date follows them. Change the terms on the company to change it.` };
  }
  if (dueKey < draft.invoiceDateKey) return { error: "The due date can't be before the invoice date." };
  try {
    await setInvoiceDates(draft.hubspotInvoiceId, { invoiceDateKey: draft.invoiceDateKey, dueDateKey: dueKey });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  await draft.updateDue(new Date(`${dueKey}T12:00:00.000Z`));
  return { ok: true };
}

/** Emails the person asking exactly what the client would get, marked as a preview. Approves nothing. */
export async function emailDraftPreview(kind: DraftKind, rowId: string, toEmail: string): Promise<{ ok: true } | { error: string }> {
  const draft = await loadDraft(kind, rowId);
  if (!draft) return { error: "This draft isn't waiting anymore." };
  const plan = planDelivery(draft.destination);
  const totalCents = linesTotal(draft.lines);
  const inv: InvoiceForDelivery = {
    hubspotInvoiceId: draft.hubspotInvoiceId,
    number: "(number given on Approve)",
    title: draft.title,
    totalCents,
    dueDate: draft.dueDateKey ? `${draft.dueDateKey}T12:00:00.000Z` : null,
    viewUrl: null,
    pdfUrl: null,
    lines: draft.lines,
    // Not used for the email body; only needed by the delivery step.
    destType: "BUILDING",
    destId: "",
    link: "/erp/ready-to-send",
  };
  const banner =
    `<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;padding:10px 12px;margin-bottom:16px;font-size:13px;color:#78350f">` +
    `<strong>Preview only.</strong> Nothing was approved or sent to the client. On Approve: ${describePlan(plan).replace(/</g, "&lt;")} ` +
    `The real email also has the invoice PDF attached and a View and pay button.</div>`;
  try {
    await sendEmail({
      type: "INVOICE_PREVIEW",
      to: toEmail,
      subject: `[Preview] Invoice from Sueep: ${draft.title}`,
      html: banner + invoiceEmailHtml(inv, draft.destination?.company?.name ?? null, false),
      link: "/erp/ready-to-send",
      sentBy: toEmail,
    });
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
