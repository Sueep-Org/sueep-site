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
import { namesByEmail } from "./janitorialQualityChecks";
import { BILLING_METHOD_LABELS } from "./clientCompanies";
import { PORTAL_STATUS_LABELS, isPortalStatus, type PortalStatus } from "./portalStatus";
import { loadFollowUps, summarizeFollowUps } from "./invoiceFollowUps";
import { followUpNumber, type FollowUpSummary } from "./invoiceFollowUpShared";
import { loadShortPays } from "./invoiceShortPays";
import type { ShortPayInfo } from "./invoiceShortPayShared";

export type InvoiceStatus = "PAID" | "PARTLY_PAID" | "OPEN" | "OVERDUE" | "NOT_IN_QBO";

/** One line of an invoice's history on the Invoices page. */
export type InvoiceEvent = {
  /** "YYYY-MM-DD", Eastern */
  day: string;
  /** For ordering events on the same day */
  sort: string;
  what: string;
  by: string | null;
  detail: string | null;
  proofs: { url: string; filename: string }[];
  tone: "good" | "bad" | null;
  /** Follow-up lines, so they can be removed */
  followUpId?: string;
};

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
  /** When the billed work was finished ("YYYY-MM-DD"), earliest and latest; months cover the whole month. Null when not linked to ERP work. */
  workDate: { from: string; to: string; monthly: boolean } | null;
  totalCents: number;
  balanceCents: number;
  status: InvoiceStatus;
  daysLate: number;
  paidDate: string | null;
  payments: { date: string | null; cents: number; ref: string | null }[];
  /** How it reached the client, when the ERP sent it, and its history since Ready to send */
  sent: {
    deliveryId: string;
    /** "Waiting to be uploaded" or "Waiting to be sent" while on Needs sending, else null */
    waiting: string | null;
    /** Uploads only: where the client's portal has it */
    portal: { status: PortalStatus; label: string; method: string; at: string | null; reason: string | null } | null;
    /** What happened to it after Ready to send, oldest first: approved, emailed or uploaded, portal status changes */
    events: InvoiceEvent[];
  } | null;
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
  /** Latest follow-up and promise to pay, by invoice number */
  followUp: FollowUpSummary | null;
  /** Follow-ups as history lines, oldest first */
  followUps: InvoiceEvent[];
  /** Why it was paid short, when someone said */
  shortPay: ShortPayInfo | null;
};

const normNumber = (n: string | null | undefined) => (n ?? "").trim().toUpperCase() || null;
const keyOf = (d: Date | null) => (d ? utcDateKey(d) : null);

/** A finished day as an invoice's work date. */
const dayWork = (key: string | null) => (key ? { from: key, to: key, monthly: false } : null);

/** A janitorial month as an invoice's work date: the whole month. */
function monthWork(periodStart: Date) {
  const from = utcDateKey(periodStart);
  const end = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 0));
  return { from, to: utcDateKey(end), monthly: true };
}

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
  workDate: { from: string; to: string; monthly: boolean } | null;
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
      select: {
        ...pick,
        building: { select: { id: true, name: true, ...buildingCompanies } },
        turnoverRequest: { select: { billingStatus: true, completedAt: true, projects: { select: { turnoverCompletedAt: true, projectEndDate: true }, take: 1 } } },
      },
    }),
    prisma.hubSpotSovInvoice.findMany({
      select: {
        ...pick,
        project: { select: { id: true, jobTitle: true, clientCompany: { select: { name: true } } } },
        sovItem: { select: { billingStatus: true, completedAt: true } },
        changeOrder: { select: { billingStatus: true, completedAt: true } },
      },
    }),
    prisma.hubSpotContractInvoice.findMany({
      select: {
        ...pick,
        period: { select: { billingStatus: true, periodStart: true, recurringContract: { select: { id: true, building: { select: { name: true, ...buildingCompanies } } } } } },
      },
    }),
    prisma.invoiceDelivery.findMany({
      select: {
        id: true,
        hubspotInvoiceId: true,
        qboInvoiceId: true,
        status: true,
        method: true,
        sentTo: true,
        emailedAt: true,
        doneAt: true,
        doneAs: true,
        doneByEmail: true,
        portalReference: true,
        doneNote: true,
        portalStatus: true,
        portalStatusAt: true,
        sentBackReason: true,
        createdAt: true,
        approvedByEmail: true,
        proofs: { select: { id: true, filename: true, createdAt: true }, orderBy: { createdAt: "asc" } },
        statusChanges: { select: { createdAt: true, fromStatus: true, toStatus: true, note: true, portalReference: true, byEmail: true }, orderBy: { createdAt: "asc" } },
      },
    }),
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
    work: { from: string; to: string; monthly: boolean } | null,
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
        workDate: null,
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
    if (work) {
      const w = g.workDate;
      g.workDate = w
        ? { from: work.from < w.from ? work.from : w.from, to: work.to > w.to ? work.to : w.to, monthly: w.monthly && work.monthly }
        : work;
    }
    if (lineStatus !== undefined) g.lineStatuses.push(normalizeBillingStatus(lineStatus ?? "NOT_BILLED"));
  };
  for (const r of units) {
    const b = r.building;
    // Same completion day Project Billing shows for a turn.
    const p = r.turnoverRequest?.projects[0];
    const done = p?.turnoverCompletedAt
      ? todayEasternKey(p.turnoverCompletedAt)
      : p?.projectEndDate
        ? utcDateKey(p.projectEndDate)
        : r.turnoverRequest?.completedAt
          ? todayEasternKey(r.turnoverRequest.completedAt)
          : null;
    add(r, b.name, `/erp/buildings/${b.id}`, b.managedByCompany?.name ?? b.ownedByCompany?.name ?? null, { tab: "janitorial", q: b.name }, r.turnoverRequest?.billingStatus, dayWork(done));
  }
  for (const r of lines) add(r, r.project.jobTitle, `/erp/projects/${r.project.id}`, r.project.clientCompany?.name ?? null, {
    tab: "post-construction",
    q: r.project.jobTitle,
  }, r.sovItem?.billingStatus ?? r.changeOrder?.billingStatus, dayWork(keyOf(r.sovItem?.completedAt ?? r.changeOrder?.completedAt ?? null)));
  for (const r of months) {
    const c = r.period.recurringContract;
    add(r, `${c.building.name} (monthly)`, `/erp/janitorial/contracts/${c.id}`, c.building.managedByCompany?.name ?? c.building.ownedByCompany?.name ?? null, {
      tab: "recurring",
      q: c.building.name,
    }, r.period.billingStatus, monthWork(r.period.periodStart));
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

  const doneNames = await namesByEmail([
    ...new Set(deliveries.flatMap((d) => [d.doneByEmail, d.approvedByEmail, ...d.statusChanges.map((c) => c.byEmail)]).filter((e): e is string => !!e)),
  ]);
  const nameOf = (email: string | null) => (email ? (doneNames.get(email.toLowerCase()) ?? email.split("@")[0]!) : null);
  const refText = (ref: string | null) => (ref ? `#${ref.replace(/^#/, "")}` : null);

  /** A delivery's history. Proofs go on the event they were saved with (same transaction, so within seconds). */
  const eventsOf = (d: (typeof deliveries)[number], method: string | null): InvoiceEvent[] => {
    const proofs = d.proofs.map((p) => ({ at: p.createdAt.getTime(), url: `/api/erp/invoice-delivery-proofs/${p.id}`, filename: p.filename }));
    const used = new Set<string>();
    const proofsAt = (at: Date) => {
      const near = proofs.filter((p) => !used.has(p.url) && Math.abs(p.at - at.getTime()) < 10_000);
      near.forEach((p) => used.add(p.url));
      return near.map(({ url, filename }) => ({ url, filename }));
    };
    const ev = (at: Date, e: Omit<InvoiceEvent, "day" | "sort" | "proofs">, withProofs = true): InvoiceEvent => ({
      day: todayEasternKey(at),
      sort: at.toISOString(),
      proofs: withProofs ? proofsAt(at) : [],
      ...e,
    });
    const portal = method ?? "the portal";
    const out: InvoiceEvent[] = [ev(d.createdAt, { what: "Approved on Ready to send", by: nameOf(d.approvedByEmail), detail: null, tone: null }, false)];
    if (d.emailedAt) out.push(ev(d.emailedAt, { what: `Emailed to ${d.sentTo.join(", ")}`, by: null, detail: null, tone: null }, false));
    if (d.doneAt) {
      const what = d.doneAs === "UPLOADED" ? `Uploaded to ${portal}` : d.doneAs === "SENT" ? "Sent by hand" : "Uploaded or sent by hand";
      // Rows marked done before doneAs existed don't say which.
      // A resubmit can replace portalReference, so the first upload's number comes from its Submitted row.
      const submitted = d.statusChanges.find((c) => c.toStatus === "SUBMITTED");
      const ref = refText(submitted ? submitted.portalReference : d.portalReference);
      out.push(ev(d.doneAt, { what, by: nameOf(d.doneByEmail), detail: [ref, d.doneNote].filter(Boolean).join(" · ") || null, tone: null }));
    }
    for (const c of d.statusChanges) {
      // Submitted is the upload itself, already listed.
      if (c.toStatus === "SUBMITTED" || !isPortalStatus(c.toStatus)) continue;
      out.push(
        ev(c.createdAt, {
          what: `${portal.replace(/^the portal$/, "Portal")}: ${PORTAL_STATUS_LABELS[c.toStatus]}`,
          by: nameOf(c.byEmail),
          detail: [refText(c.portalReference), c.note].filter(Boolean).join(" · ") || null,
          tone: c.toStatus === "SENT_BACK" ? "bad" : c.toStatus === "APPROVED" ? "good" : null,
        }),
      );
    }
    // Any proof that didn't match an event still shows.
    for (const p of proofs.filter((p) => !used.has(p.url))) {
      const at = new Date(p.at);
      out.push({ day: todayEasternKey(at), sort: at.toISOString(), what: "Proof added", by: null, detail: null, proofs: [{ url: p.url, filename: p.filename }], tone: null });
    }
    return out.sort((a, b) => a.sort.localeCompare(b.sort));
  };
  const sentInfo = (d: (typeof deliveries)[number] | undefined): InvoiceListRow["sent"] => {
    if (!d) return null;
    const method = d.method && d.method in BILLING_METHOD_LABELS ? BILLING_METHOD_LABELS[d.method as keyof typeof BILLING_METHOD_LABELS] : null;
    const portal =
      d.status === "DONE" && d.doneAs === "UPLOADED" && isPortalStatus(d.portalStatus)
        ? { status: d.portalStatus, label: PORTAL_STATUS_LABELS[d.portalStatus], method: method ?? "Portal", at: d.portalStatusAt?.toISOString() ?? null, reason: d.sentBackReason }
        : null;
    const waiting = d.status === "NEEDS_UPLOAD" ? "Waiting to be uploaded" : d.status === "NEEDS_SENDING" ? "Waiting to be sent" : null;
    return { deliveryId: d.id, waiting, portal, events: eventsOf(d, method) };
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
      workDate: g?.workDate ?? null,
      totalCents: q.totalCents,
      balanceCents: q.balanceCents,
      ...s,
      paidDate: s.status === "PAID" ? (pays.at(-1)?.date ?? g?.paidDate ?? null) : null,
      payments: pays,
      sent: sentInfo(deliveryByQbo.get(q.qboId) ?? (g && !g.key.startsWith("qbo:") ? deliveryByHubSpot.get(g.key) : undefined)),
      fromErp: g?.source === "QUICKBOOKS",
      needsLinking: !g && (q.txnDate ?? "") >= BILLING_DATA_START,
      linkTarget: g ? null : linkTargetFor(q.docNumber),
      paidMismatch: mismatchFor(g, q.balanceCents <= 0, q.balanceCents > 0),
      qboUrl: qboInvoiceUrl("production", q.qboId),
      hubspotUrl: g && g.source !== "QUICKBOOKS" ? g.viewUrl : null,
      pdfUrl: qboPdfUrl(q.qboId),
      followUp: null,
      followUps: [],
      shortPay: null,
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
      workDate: g.workDate,
      totalCents: total,
      balanceCents: balance,
      ...(onTheWay
        ? statusOf(balance, total, g.dueDate)
        : { status: "NOT_IN_QBO" as const, daysLate: balance > 0 && g.dueDate ? Math.max(0, daysBetween(g.dueDate, todayKey)) : 0 }),
      paidDate: g.status === "paid" ? g.paidDate : null,
      payments: [],
      sent: sentInfo(fromErp && g.qboInvoiceId ? deliveryByQbo.get(g.qboInvoiceId) : deliveryByHubSpot.get(g.key)),
      fromErp,
      needsLinking: false,
      linkTarget: null,
      paidMismatch: mismatchFor(g, g.status === "paid", false),
      qboUrl: fromErp && g.qboInvoiceId ? qboInvoiceUrl("production", g.qboInvoiceId) : null,
      hubspotUrl: fromErp ? null : g.viewUrl,
      pdfUrl: fromErp && g.qboInvoiceId ? qboPdfUrl(g.qboInvoiceId) : g.pdfUrl,
      followUp: null,
      followUps: [],
      shortPay: null,
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
      workDate: null,
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
      followUp: null,
      followUps: [],
      shortPay: null,
    });
  }

  const [followUps, shortPays] = await Promise.all([loadFollowUps(), loadShortPays()]);
  for (const r of rows) {
    const n = followUpNumber(r.number);
    r.shortPay = (n && shortPays.get(n)) || null;
    const list = n ? followUps.get(n) : undefined;
    if (!list) continue;
    r.followUp = summarizeFollowUps(list, r.balanceCents > 0, todayKey);
    r.followUps = list.map((f) => ({
      day: todayEasternKey(f.at),
      sort: f.at.toISOString(),
      what: `Followed up by ${f.method.toLowerCase()}${f.contactName ? ` with ${f.contactName}` : ""}`,
      by: f.by,
      detail: f.promisedDay
        ? `${f.note} · promised by ${new Date(`${f.promisedDay}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`
        : f.note,
      proofs: [],
      tone: null,
      followUpId: f.id,
    }));
  }
  return rows.sort((a, b) => (b.invoiceDate ?? "").localeCompare(a.invoiceDate ?? "") || (b.number ?? "").localeCompare(a.number ?? ""));
}
