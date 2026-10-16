/**
 * Auto-drafted janitorial invoices (DEALS_BILLING_PLAN Phase 3).
 *
 * For each contract with autoDraftInvoices on, a HubSpot draft invoice for
 * the month appears DRAFT_LEAD_DAYS before its billing day: one invoice per
 * contract per month, the base amount as line 1 and each extra as its own
 * line. It is linked to the month right away (HubSpotContractInvoice), so
 * the deal invoice sync leaves it alone. Someone with canApproveInvoices
 * reviews it on Ready to send, then approves (opens it in HubSpot, which
 * sends it to QuickBooks, and marks the month BILLED) or discards it.
 *
 * Never two drafts for one month: a month is skipped once it has any linked
 * invoice, isn't NOT_BILLED, or its draft was discarded. A short claim on
 * the period stops two runs (daily cron and Draft now) racing each other.
 */
import { prisma } from "@/lib/prisma";
import { todayEasternKey, utcDateKey } from "./dates";
import { addDaysKey } from "./manualHoursRepeat";
import { loadBuildingInvoiceDestination } from "./invoiceDestination";
import { deliverApprovedInvoice } from "./invoiceDelivery";
import {
  associateDefault,
  createDraftInvoice,
  deleteDraftInvoice,
  fetchInvoiceSnapshot,
  findBillingParties,
  openInvoice,
  replaceInvoiceLines,
  setInvoiceDates,
  type DraftLine,
  type InvoiceSnapshot,
} from "@/lib/hubspot/invoiceDrafts";

export const DRAFT_LEAD_DAYS = 3;
/** AppSetting key: Approve stays off until an Admin turns it on (first one with the bookkeeper). */
export const APPROVE_SETTING_KEY = "invoiceApproveEnabled";
const CLAIM = "Drafting now";
const CLAIM_MINUTES = 10;

export async function isApproveEnabled(): Promise<boolean> {
  return (await prisma.appSetting.findUnique({ where: { key: APPROVE_SETTING_KEY } }))?.value === "true";
}

/** The billing day in that month, pulled back when the month is short. */
export function billingDateKey(periodStart: Date, billingDay: number): string {
  const y = periodStart.getUTCFullYear();
  const m = periodStart.getUTCMonth();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return utcDateKey(new Date(Date.UTC(y, m, Math.min(billingDay, last))));
}

export function monthLabel(periodStart: Date): string {
  return periodStart.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function draftLines(
  label: string,
  period: { periodStart: Date; amountCents: number; charges: { description: string; amountCents: number }[] },
): DraftLine[] {
  const month = monthLabel(period.periodStart);
  return [
    { name: `Recurring cleaning ${label}`, description: `${label} - Janitorial services, ${month}`, amountCents: period.amountCents },
    ...period.charges.map((c) => ({ name: c.description, description: `${label}, ${month}`, amountCents: c.amountCents })),
  ];
}

export function linesTotal(lines: DraftLine[]): number {
  return lines.reduce((s, l) => s + l.amountCents, 0);
}

function snapshotColumns(s: InvoiceSnapshot) {
  const d = (v: string | null) => (v ? new Date(v) : null);
  return {
    invoiceNumber: s.number,
    status: s.status,
    invoiceDate: d(s.invoiceDate),
    dueDate: d(s.dueDate),
    invoiceTotalCents: s.totalCents,
    balanceDueCents: s.balanceDueCents,
    viewUrl: s.viewUrl,
    pdfUrl: s.pdfUrl,
  };
}

const periodInclude = {
  charges: { orderBy: { createdAt: "asc" as const } },
  hubspotInvoices: true,
  recurringContract: { select: { id: true, billingDayOfMonth: true, invoiceLabel: true, buildingId: true, building: { select: { name: true, hubspotDealId: true } } } },
};

async function loadPeriod(periodId: string) {
  return prisma.recurringContractPeriod.findUnique({ where: { id: periodId }, include: periodInclude });
}
type LoadedPeriod = NonNullable<Awaited<ReturnType<typeof loadPeriod>>>;

function labelFor(p: LoadedPeriod): string {
  return p.recurringContract.invoiceLabel?.trim() || p.recurringContract.building.name;
}

/**
 * Company payment terms decide the due date. Without terms it's the date
 * someone set on the draft (Ready to send), else due on receipt, same as
 * today's invoices.
 */
async function dueDateFor(buildingId: string, invoiceDateKey: string, setDueKey: string | null = null): Promise<string> {
  const terms = (await loadBuildingInvoiceDestination(buildingId))?.paymentTermsDays ?? null;
  if (terms != null) return addDaysKey(invoiceDateKey, terms);
  return setDueKey ?? invoiceDateKey;
}

/** Marks the period as being drafted. False if another run holds it. */
async function claim(periodId: string): Promise<boolean> {
  const stale = new Date(Date.now() - CLAIM_MINUTES * 60_000);
  const { count } = await prisma.recurringContractPeriod.updateMany({
    where: { id: periodId, OR: [{ draftError: null }, { draftError: { not: CLAIM } }, { draftErrorAt: { lt: stale } }] },
    data: { draftError: CLAIM, draftErrorAt: new Date() },
  });
  return count === 1;
}

export type DraftOutcome = { periodId: string; building: string; month: string; result: "drafted" | "skipped" | "error"; note?: string };

/** Makes the HubSpot draft for one month, if it should have one. */
export async function draftPeriod(periodId: string): Promise<DraftOutcome> {
  const p = await loadPeriod(periodId);
  if (!p) return { periodId, building: "?", month: "?", result: "error", note: "Month not found" };
  const base = { periodId, building: p.recurringContract.building.name, month: monthLabel(p.periodStart) };
  if (p.billingStatus !== "NOT_BILLED") return { ...base, result: "skipped", note: `Already ${p.billingStatus.toLowerCase().replace("_", " ")}` };
  if (p.hubspotInvoices.length) return { ...base, result: "skipped", note: "Already has an invoice" };
  if (p.draftDiscardedAt) return { ...base, result: "skipped", note: "Draft was discarded" };
  const dealId = p.recurringContract.building.hubspotDealId;
  if (!dealId) {
    await prisma.recurringContractPeriod.update({ where: { id: p.id }, data: { draftError: "No HubSpot deal is linked to this building.", draftErrorAt: new Date() } });
    return { ...base, result: "error", note: "No HubSpot deal linked" };
  }
  if (!(await claim(p.id))) return { ...base, result: "skipped", note: "Another run is drafting it" };
  // Another run may have finished a draft between the checks above and the claim.
  if (await prisma.hubSpotContractInvoice.count({ where: { periodId: p.id } })) {
    await prisma.recurringContractPeriod.update({ where: { id: p.id }, data: { draftError: null, draftErrorAt: null } });
    return { ...base, result: "skipped", note: "Already has an invoice" };
  }

  let invoiceId: string | null = null;
  try {
    const lines = draftLines(labelFor(p), p);
    const invoiceDateKey = billingDateKey(p.periodStart, p.recurringContract.billingDayOfMonth);
    const dueDateKey = await dueDateFor(p.recurringContract.buildingId, invoiceDateKey);
    const parties = await findBillingParties(dealId);

    invoiceId = await createDraftInvoice({ invoiceDateKey, dueDateKey });
    await associateDefault("invoices", invoiceId, "deals", dealId);
    if (parties.contactId) await associateDefault("invoices", invoiceId, "contacts", parties.contactId);
    if (parties.companyId) await associateDefault("invoices", invoiceId, "companies", parties.companyId);
    await replaceInvoiceLines(invoiceId, lines);
    const snap = await fetchInvoiceSnapshot(invoiceId);

    await prisma.$transaction([
      prisma.hubSpotContractInvoice.create({
        data: { periodId: p.id, hubspotInvoiceId: invoiceId, amountCents: linesTotal(lines), draftedByErp: true, linkedByName: "ERP auto draft", ...snapshotColumns(snap) },
      }),
      prisma.recurringContractPeriod.update({
        where: { id: p.id },
        data: parties.contactId ? { draftError: null, draftErrorAt: null } : { draftError: "No billing contact found on the deal. Add one to the draft in HubSpot before approving.", draftErrorAt: new Date() },
      }),
    ]);
    return { ...base, result: "drafted" };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Don't leave a half-made draft in HubSpot.
    if (invoiceId) await deleteDraftInvoice(invoiceId).catch(() => undefined);
    await prisma.recurringContractPeriod.update({ where: { id: p.id }, data: { draftError: message.slice(0, 500), draftErrorAt: new Date() } });
    return { ...base, result: "error", note: message };
  }
}

function firstOfMonth(y: number, m: number): Date {
  return new Date(Date.UTC(y, m, 1));
}

/**
 * The daily run: every auto-draft contract's month whose billing day is
 * within DRAFT_LEAD_DAYS (this month and next). Creates the month early when
 * needed, the same row the billing-day generation would make.
 */
export async function draftDueJanitorialInvoices(onlyContractId?: string): Promise<DraftOutcome[]> {
  const todayKey = todayEasternKey();
  const [y, m] = todayKey.split("-").map(Number) as [number, number];
  const months = [firstOfMonth(y, m - 1), firstOfMonth(y, m)];
  const contracts = await prisma.recurringContract.findMany({
    where: { status: "ACTIVE", autoDraftInvoices: true, ...(onlyContractId ? { id: onlyContractId } : {}) },
  });

  const out: DraftOutcome[] = [];
  for (const c of contracts) {
    for (const periodStart of months) {
      const billingKey = billingDateKey(periodStart, c.billingDayOfMonth);
      if (todayKey < addDaysKey(billingKey, -DRAFT_LEAD_DAYS)) continue;
      // Contract not running that month.
      if (c.startDate > new Date(`${billingKey}T23:59:59Z`)) continue;
      if (c.endDate && c.endDate < periodStart) continue;
      const period = await prisma.recurringContractPeriod.upsert({
        where: { recurringContractId_periodStart: { recurringContractId: c.id, periodStart } },
        create: { recurringContractId: c.id, periodStart, amountCents: c.monthlyRateCents },
        update: {},
        select: { id: true },
      });
      out.push(await draftPeriod(period.id));
    }
  }
  return out;
}

async function draftLink(periodId: string) {
  const p = await loadPeriod(periodId);
  const link = p?.hubspotInvoices.find((i) => i.draftedByErp && i.status === "draft");
  return p && link ? { p, link } : null;
}

/** Pushes the month's current amount and extras onto its draft. */
export async function refreshDraft(periodId: string): Promise<{ ok: true } | { error: string }> {
  const found = await draftLink(periodId);
  if (!found) return { error: "This month has no draft waiting." };
  const { p, link } = found;
  try {
    const lines = draftLines(labelFor(p), p);
    const invoiceDateKey = billingDateKey(p.periodStart, p.recurringContract.billingDayOfMonth);
    // Keeps a due date someone set by hand when the company has no terms.
    const setDue = link.dueDate ? utcDateKey(link.dueDate) : null;
    await setInvoiceDates(link.hubspotInvoiceId, { invoiceDateKey, dueDateKey: await dueDateFor(p.recurringContract.buildingId, invoiceDateKey, setDue) });
    await replaceInvoiceLines(link.hubspotInvoiceId, lines);
    const snap = await fetchInvoiceSnapshot(link.hubspotInvoiceId);
    await prisma.hubSpotContractInvoice.update({ where: { id: link.id }, data: { amountCents: linesTotal(lines), ...snapshotColumns(snap) } });
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Saves a new base amount and extras for the month, then updates the draft. */
export async function editDraft(
  periodId: string,
  input: { amountCents: number; charges: { description: string; amountCents: number }[] },
): Promise<{ ok: true } | { error: string }> {
  if (!(await draftLink(periodId))) return { error: "This month has no draft waiting." };
  await prisma.$transaction([
    prisma.recurringContractPeriod.update({ where: { id: periodId }, data: { amountCents: input.amountCents } }),
    prisma.recurringContractCharge.deleteMany({ where: { periodId } }),
    prisma.recurringContractCharge.createMany({ data: input.charges.map((c) => ({ ...c, periodId })) }),
  ]);
  return refreshDraft(periodId);
}

/** Opens the draft in HubSpot (sends it to QuickBooks), marks the month BILLED, then delivers it (invoiceDelivery.ts). */
export async function approveDraft(periodId: string, email: string): Promise<{ ok: true; number: string | null; delivery: string } | { error: string }> {
  if (!(await isApproveEnabled())) return { error: "Approve is turned off. An Admin turns it on for the first invoice with the bookkeeper." };
  const refreshed = await refreshDraft(periodId);
  if ("error" in refreshed) return refreshed;
  const found = await draftLink(periodId);
  if (!found) return { error: "This month has no draft waiting." };
  try {
    await openInvoice(found.link.hubspotInvoiceId);
    const snap = await fetchInvoiceSnapshot(found.link.hubspotInvoiceId);
    await prisma.$transaction([
      prisma.hubSpotContractInvoice.update({ where: { id: found.link.id }, data: { ...snapshotColumns(snap), approvedAt: new Date(), approvedByEmail: email } }),
      prisma.recurringContractPeriod.updateMany({ where: { id: periodId, billingStatus: "NOT_BILLED" }, data: { billingStatus: "BILLED", draftError: null, draftErrorAt: null } }),
    ]);
    const { p } = found;
    const lines = draftLines(labelFor(p), p);
    const delivery = await deliverApprovedInvoice(
      {
        hubspotInvoiceId: found.link.hubspotInvoiceId,
        number: snap.number,
        title: `${p.recurringContract.building.name}, ${monthLabel(p.periodStart)}`,
        totalCents: linesTotal(lines),
        dueDate: snap.dueDate,
        viewUrl: snap.viewUrl,
        pdfUrl: snap.pdfUrl,
        lines,
        destType: "BUILDING",
        destId: p.recurringContract.buildingId,
        link: `/erp/janitorial/contracts/${p.recurringContract.id}`,
      },
      email,
    );
    return { ok: true, number: snap.number, delivery };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Deletes the draft in HubSpot and keeps the month from being drafted again. */
export async function discardDraft(periodId: string, email: string): Promise<{ ok: true } | { error: string }> {
  const found = await draftLink(periodId);
  if (!found) return { error: "This month has no draft waiting." };
  try {
    await deleteDraftInvoice(found.link.hubspotInvoiceId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  await prisma.$transaction([
    prisma.hubSpotContractInvoice.delete({ where: { id: found.link.id } }),
    prisma.recurringContractPeriod.update({ where: { id: periodId }, data: { draftDiscardedAt: new Date(), draftDiscardedByEmail: email, draftError: null, draftErrorAt: null } }),
  ]);
  return { ok: true };
}

/** Undoes a discard and drafts the month now. */
export async function redraftPeriod(periodId: string): Promise<DraftOutcome> {
  await prisma.recurringContractPeriod.update({ where: { id: periodId }, data: { draftDiscardedAt: null, draftDiscardedByEmail: null } });
  return draftPeriod(periodId);
}

export const CLAIM_TEXT = CLAIM;
