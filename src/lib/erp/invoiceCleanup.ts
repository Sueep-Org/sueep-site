/**
 * The invoice cleanup page (/erp/invoices/cleanup): paid HubSpot invoices the
 * sync couldn't place on any work (any date, unlike the Invoices page's
 * Needs linking, which starts at BILLING_DATA_START), the ones a person
 * dismissed, finished work that's still unpaid with no invoice at all, and a
 * count of open invoices QuickBooks never got.
 */
import { prisma } from "@/lib/prisma";
import { normalizeBillingStatus, isOwedStatus } from "./billingStatus";
import { todayEasternKey, utcDateKey } from "./dates";
import { loadUnlinkedHubSpotInvoices, readHeaders } from "./unlinkedHubSpotInvoices";
import {
  OLD_UNPAID_DAYS,
  isDismissReason,
  type CleanupInvoice,
  type DismissedInvoice,
  type InvoiceCleanup,
  type OldUnpaidRow,
} from "./invoiceCleanupShared";

/** Invoices that count as real (not draft, not voided). */
const LIVE = ["open", "paid"];
const DONE_TURN = ["COMPLETED", "QUALITY_CHECK", "APPROVED"];
/** Change orders that are billable once done, and the ones that are done. */
const BILLABLE_CO = ["APPROVED", "SIGNED", "COMPLETED"];
const DONE_PROJECT = ["COMPLETE", "COMPLETED"];

const normNumber = (n: string | null | undefined) => (n ?? "").trim().toUpperCase() || null;
const keyOf = (d: Date | null | undefined) => (d ? utcDateKey(d) : null);

function push(map: Map<string, string[]>, key: string | null | undefined, label: string) {
  if (!key) return;
  const list = map.get(key) ?? [];
  list.push(label);
  map.set(key, list);
}

export async function loadInvoiceCleanup(): Promise<InvoiceCleanup> {
  const cutoffKey = utcDateKey(new Date(Date.now() - OLD_UNPAID_DAYS * 86_400_000));

  const [unlinked, sovItems, changeOrders, turns, periods, projects, sovLinks, unitLinks, contractLinks, qboCount, dismissedRows] = await Promise.all([
    // Every date: "" sorts before any date key.
    loadUnlinkedHubSpotInvoices(""),
    prisma.projectSOVItem.findMany({
      where: { billingStatus: { notIn: ["PAID", "INVOICE_PAID", "VOIDED"] } },
      select: { id: true, description: true, billingStatus: true, completedAt: true, scheduledValueCents: true, sov: { select: { project: { select: { id: true, jobTitle: true, status: true, projectEndDate: true } } } } },
    }),
    prisma.projectChangeOrder.findMany({
      where: { status: { in: BILLABLE_CO }, OR: [{ billingStatus: null }, { billingStatus: { notIn: ["PAID", "INVOICE_PAID", "VOIDED"] } }] },
      select: { id: true, title: true, status: true, billingStatus: true, completedAt: true, contractValueCents: true, project: { select: { id: true, jobTitle: true, buildingId: true } } },
    }),
    prisma.turnoverRequest.findMany({
      where: { status: { in: DONE_TURN as never[] }, billingStatus: { notIn: ["PAID", "INVOICE_PAID", "VOIDED"] } },
      select: { id: true, unitNumber: true, billingStatus: true, completedAt: true, endDate: true, approvedPriceCents: true, priceCents: true, building: { select: { id: true, name: true } } },
    }),
    prisma.recurringContractPeriod.findMany({
      where: { billingStatus: { notIn: ["PAID", "INVOICE_PAID", "VOIDED"] }, amountCents: { gt: 0 } },
      select: { id: true, periodStart: true, billingStatus: true, amountCents: true, recurringContract: { select: { building: { select: { id: true, name: true } } } } },
    }),
    prisma.project.findMany({
      where: {
        status: { in: DONE_PROJECT },
        turnoverRequestId: null,
        recurringContractPeriodId: null,
        OR: [{ sov: null }, { sov: { items: { none: {} } } }],
        AND: [{ OR: [{ billingStatus: null }, { billingStatus: { notIn: ["PAID", "INVOICE_PAID", "VOIDED"] } }] }],
      },
      select: { id: true, jobTitle: true, billingStatus: true, completedAt: true, projectEndDate: true, contractValueCents: true, buildingId: true },
    }),
    prisma.hubSpotSovInvoice.findMany({ where: { status: { in: LIVE } }, select: { projectId: true, sovItemId: true, changeOrderId: true, status: true, invoiceNumber: true } }),
    prisma.hubSpotUnitInvoice.findMany({ where: { status: { in: LIVE } }, select: { turnoverRequestId: true, status: true, invoiceNumber: true } }),
    prisma.hubSpotContractInvoice.findMany({ where: { status: { in: LIVE } }, select: { periodId: true, status: true, invoiceNumber: true } }),
    prisma.qboInvoice.count(),
    prisma.hubSpotInvoiceLineItemMatch.findMany({
      where: { status: "IGNORED", dismissReason: { not: null } },
      select: {
        hubspotInvoiceId: true,
        amountCents: true,
        dismissReason: true,
        dismissNote: true,
        resolvedByName: true,
        resolvedAt: true,
        project: { select: { id: true, jobTitle: true } },
        building: { select: { id: true, name: true } },
      },
    }),
  ]);

  // ── Unpaid work per project and per building (any age) ──
  const unpaidByProject = new Map<string, string[]>();
  const unpaidByBuilding = new Map<string, string[]>();
  for (const s of sovItems) if (isOwedStatus(s.billingStatus)) push(unpaidByProject, s.sov.project.id, s.description);
  for (const c of changeOrders) {
    if (!isOwedStatus(c.billingStatus)) continue;
    push(unpaidByProject, c.project.id, `CO: ${c.title}`);
    push(unpaidByBuilding, c.project.buildingId, `CO: ${c.title}`);
  }
  for (const t of turns) if (isOwedStatus(t.billingStatus)) push(unpaidByBuilding, t.building.id, `Unit ${t.unitNumber ?? "?"}`);
  for (const p of periods) if (isOwedStatus(p.billingStatus)) push(unpaidByBuilding, p.recurringContract.building.id, `${p.periodStart.toISOString().slice(0, 7)} month`);

  // ── Paid, not linked ──
  const ids = unlinked.map((u) => u.hubspotInvoiceId);
  const lineRows = ids.length
    ? await prisma.hubSpotInvoiceLineItemMatch.findMany({
        where: { hubspotInvoiceId: { in: ids }, status: "PENDING_REVIEW" },
        select: { hubspotInvoiceId: true, lineItemText: true, amountCents: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const linesByInvoice = new Map<string, { text: string; cents: number }[]>();
  for (const l of lineRows) {
    const list = linesByInvoice.get(l.hubspotInvoiceId) ?? [];
    list.push({ text: l.lineItemText, cents: l.amountCents });
    linesByInvoice.set(l.hubspotInvoiceId, list);
  }
  const waitingProjects = new Set<string>();
  const waitingBuildings = new Set<string>();
  const unlinkedRows: CleanupInvoice[] = unlinked.map((u) => {
    const unpaid = u.projectId ? unpaidByProject.get(u.projectId) ?? [] : u.buildingId ? unpaidByBuilding.get(u.buildingId) ?? [] : [];
    if (u.projectId) waitingProjects.add(u.projectId);
    if (u.buildingId) waitingBuildings.add(u.buildingId);
    return {
      hubspotInvoiceId: u.hubspotInvoiceId,
      number: u.number,
      status: u.status,
      invoiceDateKey: u.invoiceDateKey,
      amountCents: u.amountCents,
      lines: linesByInvoice.get(u.hubspotInvoiceId) ?? [],
      title: u.title,
      href: u.href,
      linkTarget: u.projectId ? { scope: "project", id: u.projectId, title: u.title } : u.buildingId ? { scope: "building", id: u.buildingId, title: u.title } : null,
      workState: !u.projectId && !u.buildingId ? "NO_JOB" : unpaid.length ? "HAS_UNPAID" : "ALL_PAID",
      unpaid: unpaid.slice(0, 6),
      unpaidCount: unpaid.length,
    };
  });
  // Oldest first: those are the ones nobody has looked at.
  unlinkedRows.sort((a, b) => (a.invoiceDateKey ?? "").localeCompare(b.invoiceDateKey ?? ""));

  // ── Dismissed ──
  const dismissedById = new Map<string, DismissedInvoice>();
  for (const r of dismissedRows) {
    const row = dismissedById.get(r.hubspotInvoiceId);
    if (row) {
      row.amountCents += r.amountCents;
      continue;
    }
    if (!isDismissReason(r.dismissReason)) continue;
    dismissedById.set(r.hubspotInvoiceId, {
      hubspotInvoiceId: r.hubspotInvoiceId,
      number: null,
      invoiceDateKey: null,
      amountCents: r.amountCents,
      title: r.project?.jobTitle ?? r.building?.name ?? "No building or project matched",
      href: r.project ? `/erp/projects/${r.project.id}` : r.building ? `/erp/buildings/${r.building.id}` : "/erp/billing",
      reason: r.dismissReason,
      note: r.dismissNote,
      byName: r.resolvedByName,
      atKey: r.resolvedAt ? todayEasternKey(r.resolvedAt) : null,
    });
  }
  if (dismissedById.size > 0) {
    try {
      for (const h of await readHeaders([...dismissedById.keys()].sort())) {
        const row = dismissedById.get(h.id);
        if (row) Object.assign(row, { number: h.number, invoiceDateKey: h.date });
      }
    } catch (e) {
      console.error("[invoiceCleanup] HubSpot read failed", e);
    }
  }
  const dismissed = [...dismissedById.values()].sort((a, b) => (b.atKey ?? "").localeCompare(a.atKey ?? ""));

  // ── Old unpaid work with no invoice at all ──
  const linkedSov = new Set(sovLinks.flatMap((l) => l.sovItemId ?? []));
  const linkedCo = new Set(sovLinks.flatMap((l) => l.changeOrderId ?? []));
  const linkedProject = new Set(sovLinks.filter((l) => !l.sovItemId && !l.changeOrderId).map((l) => l.projectId));
  const linkedTurn = new Set(unitLinks.flatMap((l) => l.turnoverRequestId ?? []));
  const linkedPeriod = new Set(contractLinks.map((l) => l.periodId));
  const status = (s: string | null) => (normalizeBillingStatus(s) === "BILLED" ? "BILLED" : "NOT_BILLED") as OldUnpaidRow["status"];
  const billing = (tab: string, q: string) => `/erp/billing?tab=${tab}&q=${encodeURIComponent(q)}`;
  const oldUnpaid: OldUnpaidRow[] = [];
  for (const s of sovItems) {
    const p = s.sov.project;
    const done = keyOf(s.completedAt) ?? (DONE_PROJECT.includes(p.status) ? keyOf(p.projectEndDate) : null);
    if (!isOwedStatus(s.billingStatus) || !done || done > cutoffKey || linkedSov.has(s.id)) continue;
    oldUnpaid.push({ key: `sov:${s.id}`, kind: "SOV", groupKey: `p:${p.id}`, groupHref: `/erp/projects/${p.id}`, title: p.jobTitle, detail: s.description, status: status(s.billingStatus), doneKey: done, cents: s.scheduledValueCents || null, billingHref: billing("post-construction", p.jobTitle), waitingInvoice: waitingProjects.has(p.id) });
  }
  for (const c of changeOrders) {
    const done = keyOf(c.completedAt);
    if (c.status !== "COMPLETED" || !isOwedStatus(c.billingStatus) || !done || done > cutoffKey || linkedCo.has(c.id)) continue;
    oldUnpaid.push({ key: `co:${c.id}`, kind: "CO", groupKey: `p:${c.project.id}`, groupHref: `/erp/projects/${c.project.id}`, title: c.project.jobTitle, detail: c.title, status: status(c.billingStatus), doneKey: done, cents: c.contractValueCents, billingHref: billing("post-construction", c.project.jobTitle), waitingInvoice: waitingProjects.has(c.project.id) || (!!c.project.buildingId && waitingBuildings.has(c.project.buildingId)) });
  }
  for (const t of turns) {
    const done = keyOf(t.completedAt ?? t.endDate);
    if (!isOwedStatus(t.billingStatus) || !done || done > cutoffKey || linkedTurn.has(t.id)) continue;
    oldUnpaid.push({ key: `turn:${t.id}`, kind: "TURN", groupKey: `b:${t.building.id}`, groupHref: `/erp/buildings/${t.building.id}`, title: t.building.name, detail: `Unit ${t.unitNumber ?? "?"}`, status: status(t.billingStatus), doneKey: done, cents: t.approvedPriceCents ?? t.priceCents, billingHref: billing("janitorial", t.building.name), waitingInvoice: waitingBuildings.has(t.building.id) });
  }
  for (const p of periods) {
    const done = keyOf(p.periodStart)!;
    if (!isOwedStatus(p.billingStatus) || done > cutoffKey || linkedPeriod.has(p.id)) continue;
    const b = p.recurringContract.building;
    oldUnpaid.push({ key: `month:${p.id}`, kind: "MONTH", groupKey: `b:${b.id}`, groupHref: `/erp/buildings/${b.id}`, title: b.name, detail: new Date(p.periodStart).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }), status: status(p.billingStatus), doneKey: done, cents: p.amountCents, billingHref: billing("recurring", b.name), waitingInvoice: waitingBuildings.has(b.id) });
  }
  for (const p of projects) {
    const done = keyOf(p.completedAt ?? p.projectEndDate);
    if (!isOwedStatus(p.billingStatus) || !done || done > cutoffKey || linkedProject.has(p.id)) continue;
    oldUnpaid.push({ key: `project:${p.id}`, kind: "PROJECT", groupKey: `p:${p.id}`, groupHref: `/erp/projects/${p.id}`, title: p.jobTitle, detail: "Whole project (no SOV lines)", status: status(p.billingStatus), doneKey: done, cents: p.contractValueCents, billingHref: billing("post-construction", p.jobTitle), waitingInvoice: waitingProjects.has(p.id) });
  }
  oldUnpaid.sort((a, b) => a.title.localeCompare(b.title) || a.doneKey.localeCompare(b.doneKey));

  // ── Open invoices QuickBooks doesn't have ──
  let notInQuickBooks = 0;
  if (qboCount > 0) {
    const qboNumbers = new Set((await prisma.qboInvoice.findMany({ select: { docNumber: true } })).map((q) => normNumber(q.docNumber)).filter(Boolean));
    const open = new Set(
      [...sovLinks, ...unitLinks, ...contractLinks]
        .filter((l) => l.status === "open")
        .map((l) => normNumber(l.invoiceNumber))
        .filter((n): n is string => !!n && !qboNumbers.has(n)),
    );
    notInQuickBooks = open.size;
  }

  return { unlinked: unlinkedRows, dismissed, oldUnpaid, notInQuickBooks, quickBooksSynced: qboCount > 0 };
}
