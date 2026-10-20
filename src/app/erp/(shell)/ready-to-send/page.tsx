import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canApproveInvoices } from "@/lib/erpAuth";
import { InfoTip } from "@/app/erp/components/ui";
import { todayEasternKey } from "@/lib/erp/dates";
import { addDaysKey } from "@/lib/erp/manualHoursRepeat";
import { BILLING_METHOD_LABELS } from "@/lib/erp/clientCompanies";
import { loadBuildingInvoiceDestination, loadProjectInvoiceDestination, type InvoiceDestination } from "@/lib/erp/invoiceDestination";
import { loadBillableGroups, loadWaitingItemDrafts } from "@/lib/erp/itemInvoiceDrafts";
import { describePlan, invoiceLinesFor, planDelivery } from "@/lib/erp/invoiceDelivery";
import { CLAIM_TEXT, DRAFT_LEAD_DAYS, billingDateKey, draftLines, isApproveEnabled, linesTotal, monthLabel } from "@/lib/erp/janitorialInvoiceDrafts";
import { ReadyToSend, type BillableGroupRow, type ContractSetting, type DeliveryRow, type DraftRow, type MonthRow, type SentRow } from "./ReadyToSend";

export const metadata: Metadata = { title: "Ready to send" };
export const dynamic = "force-dynamic";

function destinationSummary(d: InvoiceDestination | null): { client: string | null; method: string | null; sendTo: string | null } {
  if (!d) return { client: null, method: null, sendTo: null };
  return {
    client: d.company?.name ?? null,
    method: d.method.value ? BILLING_METHOD_LABELS[d.method.value] : null,
    sendTo: d.sendTo.value.join(", ") || null,
  };
}

/** Next month (this or next) whose billing day hasn't passed, and when its draft appears. */
function nextDraftKey(todayKey: string, billingDay: number): string {
  const [y, m] = todayKey.split("-").map(Number) as [number, number];
  for (const start of [new Date(Date.UTC(y, m - 1, 1)), new Date(Date.UTC(y, m, 1))]) {
    const key = billingDateKey(start, billingDay);
    if (key >= todayKey) return addDaysKey(key, -DRAFT_LEAD_DAYS);
  }
  return addDaysKey(billingDateKey(new Date(Date.UTC(y, m + 1, 1)), billingDay), -DRAFT_LEAD_DAYS);
}

export default async function ReadyToSendPage() {
  const auth = await getErpAuth();
  if (!auth || !canApproveInvoices(auth.role)) redirect("/erp");
  const todayKey = todayEasternKey();

  const periodSelect = {
    id: true,
    periodStart: true,
    amountCents: true,
    draftError: true,
    draftDiscardedAt: true,
    draftDiscardedByEmail: true,
    charges: { select: { description: true, amountCents: true }, orderBy: { createdAt: "asc" as const } },
    recurringContract: { select: { id: true, billingDayOfMonth: true, invoiceLabel: true, buildingId: true, building: { select: { name: true } } } },
  };

  const [drafts, failed, discarded, contracts, approveEnabled, billable, itemDrafts, waitingDeliveries, sentDeliveries] = await Promise.all([
    prisma.hubSpotContractInvoice.findMany({
      where: { draftedByErp: true, status: "draft" },
      select: { hubspotInvoiceId: true, amountCents: true, invoiceDate: true, dueDate: true, period: { select: periodSelect } },
      orderBy: { invoiceDate: "asc" },
    }),
    prisma.recurringContractPeriod.findMany({
      where: { draftError: { not: null }, NOT: { draftError: CLAIM_TEXT }, billingStatus: "NOT_BILLED", hubspotInvoices: { none: {} }, draftDiscardedAt: null },
      select: { ...periodSelect, draftErrorAt: true },
    }),
    prisma.recurringContractPeriod.findMany({
      where: { draftDiscardedAt: { gte: new Date(Date.now() - 60 * 86_400_000) }, billingStatus: "NOT_BILLED", hubspotInvoices: { none: {} } },
      select: periodSelect,
      orderBy: { draftDiscardedAt: "desc" },
    }),
    prisma.recurringContract.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, autoDraftInvoices: true, invoiceLabel: true, billingDayOfMonth: true, monthlyRateCents: true, buildingId: true, building: { select: { name: true, hubspotDealId: true } } },
      orderBy: { building: { name: "asc" } },
    }),
    isApproveEnabled(),
    loadBillableGroups(),
    loadWaitingItemDrafts(),
    prisma.invoiceDelivery.findMany({ where: { status: { in: ["NEEDS_UPLOAD", "NEEDS_SENDING"] } }, orderBy: { createdAt: "asc" } }),
    prisma.invoiceDelivery.findMany({ where: { status: { in: ["EMAILED", "DONE"] }, updatedAt: { gte: new Date(Date.now() - 14 * 86_400_000) } }, orderBy: { updatedAt: "desc" }, take: 30 }),
  ]);

  // Where each building's or job's invoices go, keyed "BUILDING:<id>" / "PROJECT:<id>".
  const destinations = new Map<string, InvoiceDestination | null>();
  const destinationFor = async (type: string, id: string) => {
    const key = `${type}:${id}`;
    if (!destinations.has(key)) destinations.set(key, type === "PROJECT" ? await loadProjectInvoiceDestination(id) : await loadBuildingInvoiceDestination(id));
    return destinations.get(key) ?? null;
  };
  for (const d of drafts) await destinationFor("BUILDING", d.period.recurringContract.buildingId);
  for (const g of billable) await destinationFor(g.type, g.id);
  for (const { draft } of itemDrafts) await destinationFor(draft.groupType, draft.groupId);

  const label = (p: (typeof drafts)[number]["period"]) => p.recurringContract.invoiceLabel?.trim() || p.recurringContract.building.name;
  const monthRow = (p: (typeof drafts)[number]["period"]): MonthRow => ({
    periodId: p.id,
    building: p.recurringContract.building.name,
    month: monthLabel(p.periodStart),
    note: p.draftError,
    discardedBy: p.draftDiscardedByEmail,
  });

  const draftRows: DraftRow[] = drafts.map((d) => {
    const lines = draftLines(label(d.period), d.period);
    return {
      kind: "month",
      rowId: d.period.id,
      ...monthRow(d.period),
      hubspotInvoiceId: d.hubspotInvoiceId,
      invoiceDateKey: billingDateKey(d.period.periodStart, d.period.recurringContract.billingDayOfMonth),
      dueDate: d.dueDate?.toISOString().slice(0, 10) ?? null,
      lines,
      amountCents: d.period.amountCents,
      charges: d.period.charges,
      totalCents: linesTotal(lines),
      draftTotalCents: d.amountCents,
      ...destinationSummary(destinations.get(`BUILDING:${d.period.recurringContract.buildingId}`) ?? null),
      deliveryPlan: describePlan(planDelivery(destinations.get(`BUILDING:${d.period.recurringContract.buildingId}`) ?? null)),
      paymentTermsDays: destinations.get(`BUILDING:${d.period.recurringContract.buildingId}`)?.paymentTermsDays ?? null,
    };
  });
  for (const { draft, lines, dueDate } of itemDrafts) {
    const total = lines.reduce((s, l) => s + l.amountCents, 0);
    draftRows.push({
      kind: "items",
      rowId: draft.id,
      periodId: draft.id,
      building: draft.title,
      month: `Drafted ${draft.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}`,
      note: draft.note,
      discardedBy: null,
      hubspotInvoiceId: draft.hubspotInvoiceId,
      // Ready to bill invoices are dated the day they're approved (itemInvoiceDrafts.ts),
      // so show today, and the due date it would get if approved today.
      invoiceDateKey: todayKey,
      dueDate: (() => {
        const terms = destinations.get(`${draft.groupType}:${draft.groupId}`)?.paymentTermsDays;
        if (terms != null) return addDaysKey(todayKey, terms);
        const set = dueDate?.toISOString().slice(0, 10) ?? null;
        return set && set > todayKey ? set : todayKey;
      })(),
      lines: lines.map(({ name, description, amountCents }) => ({ name, description, amountCents })),
      amountCents: total,
      charges: [],
      totalCents: total,
      draftTotalCents: total,
      ...destinationSummary(destinations.get(`${draft.groupType}:${draft.groupId}`) ?? null),
      deliveryPlan: describePlan(planDelivery(destinations.get(`${draft.groupType}:${draft.groupId}`) ?? null)),
      paymentTermsDays: destinations.get(`${draft.groupType}:${draft.groupId}`)?.paymentTermsDays ?? null,
    });
  }

  // Portal logins (from Company Info) linked to each client company on Needs sending.
  const companyIds = [...new Set(waitingDeliveries.map((d) => d.clientCompanyId).filter((x): x is string => !!x))];
  const loginLinks = companyIds.length
    ? await prisma.clientCompanyLogin.findMany({ where: { companyId: { in: companyIds } }, select: { companyId: true, login: { select: { name: true } } } })
    : [];
  const deliveryRows: DeliveryRow[] = [];
  for (const d of waitingDeliveries) {
    const { lines } = await invoiceLinesFor(d.hubspotInvoiceId);
    deliveryRows.push({
      id: d.id,
      status: d.status === "NEEDS_UPLOAD" ? "NEEDS_UPLOAD" : "NEEDS_SENDING",
      title: d.title,
      invoiceNumber: d.invoiceNumber,
      totalCents: d.totalCents,
      reason: d.reason,
      clientName: d.clientName,
      clientCompanyId: d.clientCompanyId,
      method: d.method && d.method in BILLING_METHOD_LABELS ? BILLING_METHOD_LABELS[d.method as keyof typeof BILLING_METHOD_LABELS] : null,
      portalUrl: d.portalUrl,
      viewUrl: d.viewUrl,
      pdfUrl: d.pdfUrl,
      link: d.link,
      lines,
      logins: loginLinks.filter((l) => l.companyId === d.clientCompanyId).map((l) => l.login.name),
      approvedAt: d.createdAt.toISOString(),
    });
  }
  const sentRows: SentRow[] = sentDeliveries.map((d) => ({
    id: d.id,
    title: d.title,
    invoiceNumber: d.invoiceNumber,
    totalCents: d.totalCents,
    how: d.status === "EMAILED" ? `Emailed to ${d.sentTo.join(", ")}` : `Marked done by ${d.doneByEmail ?? "someone"}`,
    when: (d.emailedAt ?? d.doneAt ?? d.updatedAt).toISOString(),
  }));

  const billableRows: BillableGroupRow[] = billable.map((g) => ({
    key: g.key,
    name: g.name,
    type: g.type,
    hasDeal: !!g.dealId,
    ...destinationSummary(destinations.get(g.key) ?? null),
    items: g.items.map((i) => ({ key: i.key, kind: i.kind, title: i.title, lineDescription: i.lineDescription, cents: i.cents, doneKey: i.doneKey, href: i.href })),
  }));

  const contractRows: ContractSetting[] = contracts.map((c) => ({
    id: c.id,
    building: c.building.name,
    label: c.invoiceLabel ?? "",
    autoDraft: c.autoDraftInvoices,
    billingDay: c.billingDayOfMonth,
    monthlyRateCents: c.monthlyRateCents,
    hasDeal: !!c.building.hubspotDealId,
    nextDraftKey: nextDraftKey(todayKey, c.billingDayOfMonth),
  }));

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-1 text-2xl font-semibold text-gray-900">
        Ready to send
        <InfoTip
          text={`Invoices the ERP drafted in HubSpot: janitorial months ${DRAFT_LEAD_DAYS} days before each billing day, and finished work picked under Ready to bill. Drafts don't go to QuickBooks or the client. Approve opens the invoice in HubSpot, which sends it to QuickBooks, and marks the month Billed.`}
        />
      </h1>
      <ReadyToSend
        drafts={draftRows}
        deliveries={deliveryRows}
        sent={sentRows}
        billable={billableRows}
        failed={failed.map(monthRow)}
        discarded={discarded.map(monthRow)}
        contracts={contractRows}
        approveEnabled={approveEnabled}
        isAdmin={auth.role === "ADMIN"}
      />
    </div>
  );
}
