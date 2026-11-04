/**
 * Every invoice, for the Invoices page. QuickBooks is the list (synced
 * nightly since January last year, with payments); the ERP's invoice links
 * add what each one is for (building, job, janitorial month). Invoices the
 * ERP knows from HubSpot that never reached QuickBooks are listed too, as
 * Not in QuickBooks, so sync failures stay visible.
 */
import { prisma } from "@/lib/prisma";
import { todayEasternKey, utcDateKey } from "./dates";
import { invoiceKey } from "./invoiceLinkSource";
import { qboInvoiceUrl } from "./qboInvoiceDrafts";
import { normalizeBillingStatus } from "./billingStatus";
import { BILLING_DATA_START } from "./dashboardMoney";
import { loadUnlinkedHubSpotInvoices } from "./unlinkedHubSpotInvoices";

export type InvoiceStatus = "PAID" | "PARTLY_PAID" | "OPEN" | "OVERDUE" | "NOT_IN_QBO";

export type InvoiceListRow = {
  key: string;
  number: string | null;
  /** QuickBooks top-level customer, else the ERP client company */
  client: string | null;
  /** What it's for in the ERP (building, job or janitorial contract) */
  forTitle: string | null;
  forHref: string | null;
  /** The same work on Project Billing */
  billingHref: string | null;
  /** The QuickBooks sub-customer, when there's no ERP link */
  subCustomer: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  totalCents: number;
  balanceCents: number;
  status: InvoiceStatus;
  daysLate: number;
  paidDate: string | null;
  payments: { date: string | null; cents: number; ref: string | null }[];
  /** How it reached the client, when the ERP sent it */
  sent: string | null;
  /** Made by the ERP in QuickBooks (Ready to send), not through HubSpot */
  fromErp: boolean;
  /** Dated since the ERP tracks billing but not tied to any ERP work yet */
  needsLinking: boolean;
  /** Where to link it: the project or building whose HubSpot deal it's on */
  linkTarget: { scope: "project" | "building"; id: string; title: string } | null;
  /** Why paid status disagrees between the invoice and its ERP lines, or null */
  paidMismatch: string | null;
  qboUrl: string | null;
  hubspotUrl: string | null;
  /** The invoice PDF: QuickBooks' (through the ERP, no QuickBooks login needed), else HubSpot's */
  pdfUrl: string | null;
};

const normNumber = (n: string | null | undefined) => (n ?? "").trim().toUpperCase() || null;
const keyOf = (d: Date | null) => (d ? utcDateKey(d) : null);

/** Days a new invoice gets to show up in the nightly QuickBooks copy before it counts as Not in QuickBooks. */
const SYNC_GRACE_DAYS = 3;

function addDays(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000);
}

type ErpGroup = {
  key: string;
  source: string;
  qboInvoiceId: string | null;
  number: string | null;
  status: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  paidDate: string | null;
  totalCents: number | null;
  balanceCents: number | null;
  lineSum: number;
  viewUrl: string | null;
  pdfUrl: string | null;
  titles: Set<string>;
  href: string | null;
  billingHref: string;
  client: string | null;
  /** The linked lines' ERP billing status (NOT_BILLED | BILLED | PAID) */
  lineStatuses: string[];
};

const qboPdfUrl = (qboId: string) => `/api/erp/qbo-invoices/${encodeURIComponent(qboId)}/pdf`;

export async function loadInvoiceList(): Promise<InvoiceListRow[]> {
  const todayKey = todayEasternKey();
  const pick = {
    source: true,
    hubspotInvoiceId: true,
    qboInvoiceId: true,
    invoiceNumber: true,
    status: true,
    invoiceDate: true,
    dueDate: true,
    paidDate: true,
    invoiceTotalCents: true,
    balanceDueCents: true,
    amountCents: true,
    viewUrl: true,
    pdfUrl: true,
  } as const;
  const buildingCompanies = { managedByCompany: { select: { name: true } }, ownedByCompany: { select: { name: true } } } as const;
  const [qboInvoices, payments, customers, units, lines, months, deliveries, unlinked] = await Promise.all([
    prisma.qboInvoice.findMany(),
    prisma.qboPayment.findMany({ select: { txnDate: true, refNum: true, links: true } }),
    prisma.qboCustomer.findMany({ select: { qboId: true, displayName: true, fullyQualifiedName: true, parentQboId: true } }),
    prisma.hubSpotUnitInvoice.findMany({
      select: { ...pick, building: { select: { id: true, name: true, ...buildingCompanies } }, turnoverRequest: { select: { billingStatus: true } } },
    }),
    prisma.hubSpotSovInvoice.findMany({
      select: {
        ...pick,
        project: { select: { id: true, jobTitle: true, clientCompany: { select: { name: true } } } },
        sovItem: { select: { billingStatus: true } },
        changeOrder: { select: { billingStatus: true } },
      },
    }),
    prisma.hubSpotContractInvoice.findMany({
      select: {
        ...pick,
        period: { select: { billingStatus: true, recurringContract: { select: { id: true, building: { select: { name: true, ...buildingCompanies } } } } } },
      },
    }),
    prisma.invoiceDelivery.findMany({ select: { hubspotInvoiceId: true, qboInvoiceId: true, status: true, sentTo: true, emailedAt: true, doneAt: true } }),
    loadUnlinkedHubSpotInvoices(BILLING_DATA_START),
  ]);

  // ERP links grouped into invoices.
  const groups = new Map<string, ErpGroup>();
  const add = (
    r: (typeof units)[number] | (typeof lines)[number] | (typeof months)[number],
    title: string,
    href: string,
    client: string | null,
    billing: { tab: string; q: string },
    lineStatus: string | null | undefined,
  ) => {
    const key = invoiceKey(r);
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        source: r.source,
        qboInvoiceId: r.qboInvoiceId,
        number: r.invoiceNumber,
        status: r.status,
        invoiceDate: keyOf(r.invoiceDate),
        dueDate: keyOf(r.dueDate),
        paidDate: keyOf(r.paidDate),
        totalCents: r.invoiceTotalCents,
        balanceCents: r.balanceDueCents,
        lineSum: 0,
        viewUrl: r.viewUrl,
        pdfUrl: r.pdfUrl,
        titles: new Set(),
        href,
        billingHref: `/erp/billing?tab=${billing.tab}&q=${encodeURIComponent(billing.q)}`,
        client,
        lineStatuses: [],
      };
      groups.set(key, g);
    }
    g.lineSum += r.amountCents;
    g.titles.add(title);
    if (lineStatus !== undefined) g.lineStatuses.push(normalizeBillingStatus(lineStatus ?? "NOT_BILLED"));
  };
  for (const r of units) {
    const b = r.building;
    add(r, b.name, `/erp/buildings/${b.id}`, b.managedByCompany?.name ?? b.ownedByCompany?.name ?? null, { tab: "janitorial", q: b.name }, r.turnoverRequest?.billingStatus);
  }
  for (const r of lines) add(r, r.project.jobTitle, `/erp/projects/${r.project.id}`, r.project.clientCompany?.name ?? null, {
    tab: "post-construction",
    q: r.project.jobTitle,
  }, r.sovItem?.billingStatus ?? r.changeOrder?.billingStatus);
  for (const r of months) {
    const c = r.period.recurringContract;
    add(r, `${c.building.name} (monthly)`, `/erp/janitorial/contracts/${c.id}`, c.building.managedByCompany?.name ?? c.building.ownedByCompany?.name ?? null, {
      tab: "recurring",
      q: c.building.name,
    }, r.period.billingStatus);
  }
  const groupByQboId = new Map<string, ErpGroup>();
  const groupByNumber = new Map<string, ErpGroup>();
  for (const g of groups.values()) {
    if (g.qboInvoiceId) groupByQboId.set(g.qboInvoiceId, g);
    const n = normNumber(g.number);
    if (n && !groupByNumber.has(n)) groupByNumber.set(n, g);
  }

  // Payments per QuickBooks invoice.
  const paymentsByInvoice = new Map<string, InvoiceListRow["payments"]>();
  for (const p of payments) {
    for (const l of (p.links ?? []) as { invoiceQboId: string; amountCents: number }[]) {
      const list = paymentsByInvoice.get(l.invoiceQboId) ?? [];
      list.push({ date: p.txnDate, cents: l.amountCents, ref: p.refNum });
      paymentsByInvoice.set(l.invoiceQboId, list);
    }
  }

  // Customer name to top-level customer and sub-customer.
  const byId = new Map(customers.map((c) => [c.qboId, c]));
  const byName = new Map<string, (typeof customers)[number]>();
  for (const c of customers) {
    byName.set(c.fullyQualifiedName, c);
    if (!byName.has(c.displayName)) byName.set(c.displayName, c);
  }
  const splitCustomer = (name: string): { client: string; sub: string | null } => {
    const c = byName.get(name);
    if (c?.parentQboId) return { client: byId.get(c.parentQboId)?.displayName ?? name.split(":")[0]!, sub: c.displayName };
    if (name.includes(":")) {
      const [parent, ...rest] = name.split(":");
      return { client: parent!.trim(), sub: rest.join(":").trim() || null };
    }
    return { client: name, sub: null };
  };

  const sentText = (d: (typeof deliveries)[number] | undefined): string | null => {
    if (!d) return null;
    const day = (x: Date | null) => (x ? x.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }) : "");
    if (d.status === "EMAILED") return `Emailed to ${d.sentTo.join(", ")} ${day(d.emailedAt)}`.trim();
    if (d.status === "DONE") return `Uploaded or sent by hand ${day(d.doneAt)}`.trim();
    return d.status === "NEEDS_UPLOAD" ? "Waiting to be uploaded" : "Waiting to be sent";
  };
  const deliveryByQbo = new Map(deliveries.filter((d) => d.qboInvoiceId).map((d) => [d.qboInvoiceId!, d]));
  const deliveryByHubSpot = new Map(deliveries.filter((d) => d.hubspotInvoiceId).map((d) => [d.hubspotInvoiceId!, d]));

  const statusOf = (balance: number, total: number, dueKey: string | null): { status: InvoiceStatus; daysLate: number } => {
    if (balance <= 0) return { status: "PAID", daysLate: 0 };
    const daysLate = dueKey ? daysBetween(dueKey, todayKey) : 0;
    if (daysLate > 0) return { status: "OVERDUE", daysLate };
    return { status: balance < total ? "PARTLY_PAID" : "OPEN", daysLate: 0 };
  };

  // Unlinked HubSpot invoices by number, to say where each one can be linked.
  const unlinkedByNumber = new Map(unlinked.filter((u) => u.number).map((u) => [normNumber(u.number)!, u]));
  const linkTargetFor = (num: string | null): InvoiceListRow["linkTarget"] => {
    const u = num ? unlinkedByNumber.get(normNumber(num)!) : undefined;
    if (!u) return null;
    if (u.projectId) return { scope: "project", id: u.projectId, title: u.title };
    if (u.buildingId) return { scope: "building", id: u.buildingId, title: u.title };
    return null;
  };
  const mismatchFor = (g: ErpGroup | undefined, invoicePaid: boolean, qboOpen: boolean): string | null => {
    if (!g || g.lineStatuses.length === 0) return null;
    const paidLines = g.lineStatuses.filter((x) => x === "PAID").length;
    if (!invoicePaid && paidLines === g.lineStatuses.length) return "Marked Paid in the ERP, but the invoice isn't paid";
    if (invoicePaid && paidLines < g.lineStatuses.length) {
      const n = g.lineStatuses.length - paidLines;
      return `The invoice is paid, but ${n} line${n === 1 ? " isn't" : "s aren't"} marked Paid in the ERP`;
    }
    if (qboOpen && g.status === "paid" && g.source !== "QUICKBOOKS") return "Paid in HubSpot, still open in QuickBooks";
    return null;
  };

  const rows: InvoiceListRow[] = [];
  const matched = new Set<string>();
  for (const q of qboInvoices) {
    const g = groupByQboId.get(q.qboId) ?? (normNumber(q.docNumber) ? groupByNumber.get(normNumber(q.docNumber)!) : undefined);
    if (g) matched.add(g.key);
    const { client, sub } = splitCustomer(q.customer);
    const pays = (paymentsByInvoice.get(q.qboId) ?? []).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    const s = statusOf(q.balanceCents, q.totalCents, q.dueDate);
    const titles = g ? [...g.titles] : [];
    rows.push({
      key: `qbo:${q.qboId}`,
      number: q.docNumber,
      client,
      forTitle: titles.length ? titles.join(", ") : null,
      forHref: g?.href ?? null,
      billingHref: g?.billingHref ?? null,
      subCustomer: sub,
      invoiceDate: q.txnDate,
      dueDate: q.dueDate,
      totalCents: q.totalCents,
      balanceCents: q.balanceCents,
      ...s,
      paidDate: s.status === "PAID" ? (pays.at(-1)?.date ?? g?.paidDate ?? null) : null,
      payments: pays,
      sent: sentText(deliveryByQbo.get(q.qboId) ?? (g && !g.key.startsWith("qbo:") ? deliveryByHubSpot.get(g.key) : undefined)),
      fromErp: g?.source === "QUICKBOOKS",
      needsLinking: !g && (q.txnDate ?? "") >= BILLING_DATA_START,
      linkTarget: g ? null : linkTargetFor(q.docNumber),
      paidMismatch: mismatchFor(g, q.balanceCents <= 0, q.balanceCents > 0),
      qboUrl: qboInvoiceUrl("production", q.qboId),
      hubspotUrl: g && g.source !== "QUICKBOOKS" ? g.viewUrl : null,
      pdfUrl: qboPdfUrl(q.qboId),
    });
  }

  // Invoices the ERP knows that aren't in the nightly QuickBooks copy yet:
  // - made by the ERP in QuickBooks (Ready to send) since the last sync: listed normally right away;
  // - HubSpot invoices from the last few days: still on their way to QuickBooks, listed normally;
  // - older HubSpot invoices: they never reached QuickBooks (since QuickBooks' list starts).
  const firstQboDate = qboInvoices.reduce<string | null>((m, q) => (q.txnDate && (!m || q.txnDate < m) ? q.txnDate : m), null);
  const recentKey = addDays(todayKey, -SYNC_GRACE_DAYS);
  for (const g of groups.values()) {
    if (matched.has(g.key)) continue;
    if (g.status !== "open" && g.status !== "paid") continue;
    if (firstQboDate && g.invoiceDate && g.invoiceDate < firstQboDate) continue;
    const fromErp = g.source === "QUICKBOOKS";
    const onTheWay = fromErp || (!!g.invoiceDate && g.invoiceDate >= recentKey);
    const total = g.totalCents ?? g.lineSum;
    const balance = g.status === "paid" ? 0 : (g.balanceCents ?? total);
    const titles = [...g.titles];
    rows.push({
      key: g.key,
      number: g.number,
      client: g.client,
      forTitle: titles.join(", "),
      forHref: g.href,
      billingHref: g.billingHref,
      subCustomer: null,
      invoiceDate: g.invoiceDate,
      dueDate: g.dueDate,
      totalCents: total,
      balanceCents: balance,
      ...(onTheWay
        ? statusOf(balance, total, g.dueDate)
        : { status: "NOT_IN_QBO" as const, daysLate: balance > 0 && g.dueDate ? Math.max(0, daysBetween(g.dueDate, todayKey)) : 0 }),
      paidDate: g.status === "paid" ? g.paidDate : null,
      payments: [],
      sent: sentText(fromErp && g.qboInvoiceId ? deliveryByQbo.get(g.qboInvoiceId) : deliveryByHubSpot.get(g.key)),
      fromErp,
      needsLinking: false,
      linkTarget: null,
      paidMismatch: mismatchFor(g, g.status === "paid", false),
      qboUrl: fromErp && g.qboInvoiceId ? qboInvoiceUrl("production", g.qboInvoiceId) : null,
      hubspotUrl: fromErp ? null : g.viewUrl,
      pdfUrl: fromErp && g.qboInvoiceId ? qboPdfUrl(g.qboInvoiceId) : g.pdfUrl,
    });
  }

  // Unlinked HubSpot invoices that aren't in QuickBooks either, so they'd show nowhere else.
  const listed = new Set(rows.map((r) => normNumber(r.number)).filter(Boolean));
  for (const u of unlinked) {
    if (u.number && listed.has(normNumber(u.number))) continue;
    const paid = u.status === "paid";
    rows.push({
      key: `hs:${u.hubspotInvoiceId}`,
      number: u.number,
      client: null,
      forTitle: null,
      forHref: null,
      billingHref: null,
      subCustomer: null,
      invoiceDate: u.invoiceDateKey,
      dueDate: null,
      totalCents: u.amountCents,
      balanceCents: paid ? 0 : u.amountCents,
      status: "NOT_IN_QBO",
      daysLate: 0,
      paidDate: null,
      payments: [],
      sent: null,
      fromErp: false,
      needsLinking: true,
      linkTarget: u.projectId ? { scope: "project", id: u.projectId, title: u.title } : u.buildingId ? { scope: "building", id: u.buildingId, title: u.title } : null,
      paidMismatch: null,
      qboUrl: null,
      hubspotUrl: null,
      pdfUrl: null,
    });
  }

  return rows.sort((a, b) => (b.invoiceDate ?? "").localeCompare(a.invoiceDate ?? "") || (b.number ?? "").localeCompare(a.number ?? ""));
}
