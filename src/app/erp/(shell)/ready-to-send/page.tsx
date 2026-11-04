import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canApproveInvoices } from "@/lib/erpAuth";
import { InfoTip } from "@/app/erp/components/ui";
import { todayEasternKey } from "@/lib/erp/dates";
import { addDaysKey } from "@/lib/erp/manualHoursRepeat";
import { BILLING_METHOD_LABELS, PORTAL_METHODS } from "@/lib/erp/clientCompanies";
import { recipientContacts, type RecipientContact } from "@/lib/erp/invoiceRecipients";
import { draftRecipients, loadBuildingInvoiceDestination, loadProjectInvoiceDestination, periodRecipients, withDraftRecipients, type InvoiceDestination } from "@/lib/erp/invoiceDestination";
import { loadBillableGroups, loadWaitingItemDrafts } from "@/lib/erp/itemInvoiceDrafts";
import { describePlan, invoiceLinesFor, planDelivery } from "@/lib/erp/invoiceDelivery";
import { CLAIM_TEXT, DRAFT_LEAD_DAYS, billingDateKey, draftLines, linesTotal, monthLabel } from "@/lib/erp/janitorialInvoiceDrafts";
import { ReadyToSend, type BillableGroupRow, type ContractSetting, type DeliveryRow, type DraftRecipientsRow, type DraftRow, type MonthRow, type QboTestRow } from "./ReadyToSend";
import { withHubSpotId } from "@/lib/erp/invoiceLinkSource";
import { qboEnvironment } from "@/lib/erp/qboClient";
import { BillingFlowBar } from "@/app/erp/components/BillingFlowBar";
import { draftContent, draftsGoToQuickBooks, type QboDraftLine, suggestedNextInvoiceNumber, loadRecentQboTests, loadWaitingQboDrafts, qboInvoiceUrl } from "@/lib/erp/qboInvoiceDrafts";

export const metadata: Metadata = { title: "Ready to send" };
export const dynamic = "force-dynamic";

const groupHref = (type: string, id: string) => (type === "PROJECT" ? `/erp/projects/${id}` : `/erp/buildings/${id}`);

function destinationSummary(d: InvoiceDestination | null): { client: string | null; method: string | null; sendTo: string | null } {
  if (!d) return { client: null, method: null, sendTo: null };
  return {
    client: d.company?.name ?? null,
    method: d.method.value ? BILLING_METHOD_LABELS[d.method.value] : null,
    sendTo: d.sendTo.value.join(", ") || null,
  };
}

/** Where Send to comes from, e.g. "UDR billing settings". */
function recipientsFrom(d: InvoiceDestination): string | null {
  const s = d.sendTo;
  if (s.source === "draft") return "Set on this invoice";
  if (s.source === "project") return "Job billing settings";
  if (s.source === "building") return "Building billing settings";
  if (s.source === "company") return `${s.sourceName} billing settings`;
  return null;
}

/** Recipients for a draft row; null when it isn't emailed (a portal or Other). */
function recipientsRow(d: InvoiceDestination | null, groupType: string, contacts: RecipientContact[]): DraftRecipientsRow | null {
  const method = d?.method.value ?? null;
  if (method && (method === "OTHER" || PORTAL_METHODS.includes(method))) return null;
  return {
    to: d?.sendTo.value ?? [],
    cc: d?.cc.value ?? [],
    from: d ? recipientsFrom(d) : null,
    set: d?.sendTo.source === "draft",
    contacts,
    groupLabel: groupType === "PROJECT" ? "job" : "building",
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
    draftSendTo: true,
    draftCc: true,
    draftRecipientsSetAt: true,
    charges: { select: { description: true, amountCents: true }, orderBy: { createdAt: "asc" as const } },
    recurringContract: { select: { id: true, billingDayOfMonth: true, invoiceLabel: true, buildingId: true, building: { select: { name: true } } } },
  };

  const qboEnv = qboEnvironment();
  const [draftRows0, failed, discarded, contracts, nextInvoiceNumber, billable, itemDrafts, waitingDeliveries, toQuickBooks, qboDrafts, qboTests] = await Promise.all([
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
    suggestedNextInvoiceNumber(),
    loadBillableGroups(),
    loadWaitingItemDrafts(),
    prisma.invoiceDelivery.findMany({ where: { status: { in: ["NEEDS_UPLOAD", "NEEDS_SENDING"] } }, orderBy: { createdAt: "asc" } }),
    draftsGoToQuickBooks(),
    loadWaitingQboDrafts(),
    loadRecentQboTests(),
  ]);
  // Waiting month drafts are HubSpot drafts until the switch to QuickBooks.
  const drafts = withHubSpotId(draftRows0);

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
  for (const d of qboDrafts) await destinationFor(d.groupType, d.groupId);
  // The client company's and job's contacts, for Edit recipients.
  const contacts = new Map<string, RecipientContact[]>();
  for (const [key, dest] of destinations) {
    const [type, id] = key.split(":");
    contacts.set(key, await recipientContacts(dest?.company?.id ?? null, type === "PROJECT" ? id! : null));
  }

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
    const dest = withDraftRecipients(destinations.get(`BUILDING:${d.period.recurringContract.buildingId}`) ?? null, periodRecipients(d.period));
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
      ...destinationSummary(dest),
      deliveryPlan: describePlan(planDelivery(dest)),
      recipients: recipientsRow(dest, "BUILDING", contacts.get(`BUILDING:${d.period.recurringContract.buildingId}`) ?? []),
      paymentTermsDays: dest?.paymentTermsDays ?? null,
      href: `/erp/janitorial/contracts/${d.period.recurringContract.id}`,
      blocked: null,
      canEdit: true,
    };
  });
  for (const { draft, lines, dueDate } of itemDrafts) {
    const total = lines.reduce((s, l) => s + l.amountCents, 0);
    const dest = withDraftRecipients(destinations.get(`${draft.groupType}:${draft.groupId}`) ?? null, draftRecipients(draft));
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
        const terms = dest?.paymentTermsDays;
        if (terms != null) return addDaysKey(todayKey, terms);
        const set = dueDate?.toISOString().slice(0, 10) ?? null;
        return set && set > todayKey ? set : todayKey;
      })(),
      lines: lines.map(({ name, description, amountCents }) => ({ name, description, amountCents })),
      amountCents: total,
      charges: [],
      totalCents: total,
      draftTotalCents: total,
      ...destinationSummary(dest),
      deliveryPlan: describePlan(planDelivery(dest)),
      recipients: recipientsRow(dest, draft.groupType, contacts.get(`${draft.groupType}:${draft.groupId}`) ?? []),
      paymentTermsDays: dest?.paymentTermsDays ?? null,
      href: groupHref(draft.groupType, draft.groupId),
      blocked: null,
      canEdit: false,
    });
  }

  // Drafts for QuickBooks (qboInvoiceDrafts.ts). On local dev these are sandbox tests.
  for (const d of qboDrafts) {
    const dest = withDraftRecipients(destinations.get(`${d.groupType}:${d.groupId}`) ?? null, draftRecipients(d));
    const c = draftContent(d, dest?.paymentTermsDays ?? null);
    const noCompany = dest?.company ? null : `No client company on this ${d.groupType === "PROJECT" ? "job" : "building"}. Set one before approving.`;
    draftRows.push({
      kind: "qbo",
      rowId: d.id,
      periodId: d.id,
      building: d.title,
      month: c.subtitle,
      note: noCompany,
      discardedBy: null,
      hubspotInvoiceId: null,
      invoiceDateKey: c.invoiceDateKey,
      dueDate: c.dueDateKey,
      lines: c.lines.map(({ name, description, amountCents }) => ({ name, description, amountCents })),
      amountCents: c.totalCents,
      charges: [],
      totalCents: c.totalCents,
      draftTotalCents: c.totalCents,
      ...destinationSummary(dest),
      deliveryPlan:
        qboEnv === "production"
          ? `Creates the invoice in QuickBooks and marks the work Billed. ${describePlan(planDelivery(dest))}`
          : `Test: creates the invoice in the QuickBooks sandbox company and emails only you a copy. Nothing in the ERP is marked billed. Live: ${describePlan(planDelivery(dest))}`,
      recipients: recipientsRow(dest, d.groupType, contacts.get(`${d.groupType}:${d.groupId}`) ?? []),
      paymentTermsDays: dest?.paymentTermsDays ?? null,
      testOnly: qboEnv !== "production",
      href: d.kind === "MONTH" && d.period ? `/erp/janitorial/contracts/${d.period.recurringContract.id}` : groupHref(d.groupType, d.groupId),
      blocked: noCompany,
      // A sandbox month is a real month in the shared database, so only live drafts edit it.
      canEdit: d.kind === "MONTH" && qboEnv === "production",
      editLines: d.kind === "ITEMS" ? (c.lines as QboDraftLine[]).filter((l) => l.itemKey).map((l) => ({ itemKey: l.itemKey!, name: l.name, amountCents: l.amountCents })) : undefined,
      lineTargets: d.kind === "ITEMS" ? [...new Map((c.lines as QboDraftLine[]).filter((l) => l.itemKey).map((l) => [l.itemKey!, l.description])).entries()].map(([key, label]) => ({ key, label })) : undefined,
    });
  }
  const qboTestRows: QboTestRow[] = qboTests.map((t) => ({
    id: t.id,
    title: t.title,
    invoiceNumber: t.invoiceNumber,
    totalCents: t.totalCents,
    url: t.qboInvoiceId ? qboInvoiceUrl(qboEnv, t.qboInvoiceId) : null,
    when: (t.approvedAt ?? t.updatedAt).toISOString(),
  }));

  // Portal logins (from Company Info) linked to each client company on Needs sending.
  const companyIds = [...new Set(waitingDeliveries.map((d) => d.clientCompanyId).filter((x): x is string => !!x))];
  const loginLinks = companyIds.length
    ? await prisma.clientCompanyLogin.findMany({ where: { companyId: { in: companyIds } }, select: { companyId: true, login: { select: { name: true } } } })
    : [];
  const deliveryRows: DeliveryRow[] = [];
  for (const d of waitingDeliveries) {
    const { lines } = d.hubspotInvoiceId ? await invoiceLinesFor(d.hubspotInvoiceId) : { lines: (d.lines ?? []) as DeliveryRow["lines"] };
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
      // QuickBooks PDFs come through the ERP (the QuickBooks one needs a sign-in).
      pdfUrl: d.qboInvoiceId ? `/api/erp/invoice-deliveries/${d.id}/pdf` : d.pdfUrl,
      // Deliveries are only made for live invoices, so they open in the real QuickBooks.
      qboUrl: d.qboInvoiceId ? qboInvoiceUrl("production", d.qboInvoiceId) : null,
      link: d.link,
      lines,
      logins: loginLinks.filter((l) => l.companyId === d.clientCompanyId).map((l) => l.login.name),
      approvedAt: d.createdAt.toISOString(),
    });
  }

  const billableRows: BillableGroupRow[] = billable.map((g) => ({
    key: g.key,
    name: g.name,
    type: g.type,
    // QuickBooks drafts need a client company instead of a HubSpot deal.
    blocker: toQuickBooks
      ? destinations.get(g.key)?.company
        ? null
        : "No client company, so it can't be drafted here"
      : g.dealId
        ? null
        : "No HubSpot deal linked, so it can't be drafted here",
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
    // QuickBooks drafts don't need a deal.
    hasDeal: toQuickBooks || !!c.building.hubspotDealId,
    nextDraftKey: nextDraftKey(todayKey, c.billingDayOfMonth),
  }));

  return (
    <div className="space-y-4">
      <BillingFlowBar current="send" />
      <h1 className="flex items-center gap-1 text-2xl font-semibold text-gray-900">
        Ready to send
        <InfoTip
          text={
            toQuickBooks
              ? `Invoices the ERP drafted: janitorial months ${DRAFT_LEAD_DAYS} days before each billing day, and finished work picked under Ready to bill. Drafts stay in the ERP. Approve creates the invoice in QuickBooks, marks the work Billed and sends it to the client.`
              : `Invoices the ERP drafted in HubSpot: janitorial months ${DRAFT_LEAD_DAYS} days before each billing day, and finished work picked under Ready to bill. Drafts don't go to QuickBooks or the client. Approve opens the invoice in HubSpot, which sends it to QuickBooks, and marks the work Billed.`
          }
        />
      </h1>
      <ReadyToSend
        drafts={draftRows}
        deliveries={deliveryRows}
        billable={billableRows}
        failed={failed.map(monthRow)}
        discarded={discarded.map(monthRow)}
        contracts={contractRows}
        isAdmin={auth.role === "ADMIN"}
        qbo={{ environment: qboEnv, on: toQuickBooks, tests: qboTestRows, nextInvoiceNumber }}
      />
    </div>
  );
}
