import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { ErpRole } from "../erpSession";
import { canSeePayroll } from "../erpAuth";
import type { JobTabRow } from "@/app/erp/(shell)/_dashboard/JobTabs";
import type { CardSection, DashboardCardData } from "@/app/erp/(shell)/_dashboard/DashboardCard";
import { normalizeBillingStatus } from "./billingStatus";
import { todayEasternKey, utcDateKey } from "./dates";
import { centsToDollars, centsToDollarsCompact } from "./money";
import { DEFAULT_PAYROLL_ANCHOR, TWO_WEEKS_MS, payPeriodForDay } from "./payPeriods";
import { computeProjectActualsWithChangeOrders, isQualifyingChangeOrder } from "./projectMargin";
import { loadLienWatch } from "./lienWatch";
import { lienDecisionCloses, lienPillLabel, type LienStage } from "./lienDeadline";

/**
 * Money tab cards (DASHBOARDS_PLAN.md Phase 4): Needs action (overdue
 * invoices, ready to bill, payroll lock, liens) and Checks (losing money,
 * reconciliation). Shown to Finance, Project Managers and Admin.
 */

/** Billing data is trusted from here on (same start as the Finance tab), so
 * older unbilled or unlinked rows don't flood the lists. */
const BILLING_DATA_START = "2026-08-01";
/** Billed this long ago with no invoice linked is worth a look. */
const UNLINKED_GRACE_DAYS = 7;
/** Liens: show anything that needs a step within this many days. */
const LIEN_WINDOW_DAYS = 30;
/** Lien stages that need someone now (the same two that send the alert email). */
const URGENT_LIEN_STAGES: LienStage[] = ["NOTICE_DUE", "DECIDE_NOW"];

const DAY_MS = 86_400_000;
const PROJECT_DONE = ["COMPLETE", "COMPLETED", "ARCHIVED", "CANCELLED"];

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / DAY_MS);
}

function shortDate(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function addDaysKey(key: string, days: number): string {
  return utcDateKey(new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY_MS));
}

// ── Overdue invoices ───────────────────────────────────────────────────────

export type OpenInvoice = { id: string; number: string | null; title: string; href: string; dueKey: string | null; daysLate: number; balanceCents: number };
type OverdueInvoice = OpenInvoice & { dueKey: string };

const AGE_BUCKETS: { label: string; min: number }[] = [
  { label: "90+ days late", min: 91 },
  { label: "61-90 days late", min: 61 },
  { label: "31-60 days late", min: 31 },
  { label: "1-30 days late", min: 1 },
];

function bucketOf(daysLate: number): string {
  return AGE_BUCKETS.find((b) => daysLate >= b.min)!.label;
}

/**
 * Open HubSpot invoices with a balance, most overdue first. One invoice can
 * cover many lines, and even show up in more than one link table, so it's
 * counted once, by its own balance. Also feeds the cash forecast.
 */
export const loadOpenInvoices = cache(async (todayKey: string): Promise<OpenInvoice[]> => {
  const where = { status: "open" };
  const pick = { hubspotInvoiceId: true, invoiceNumber: true, dueDate: true, balanceDueCents: true, invoiceTotalCents: true, amountCents: true } as const;
  const [units, lines, months] = await Promise.all([
    prisma.hubSpotUnitInvoice.findMany({ where, select: { ...pick, unitNumber: true, building: { select: { id: true, name: true } } } }),
    prisma.hubSpotSovInvoice.findMany({ where, select: { ...pick, project: { select: { id: true, jobTitle: true } } } }),
    prisma.hubSpotContractInvoice.findMany({ where, select: { ...pick, period: { select: { recurringContract: { select: { id: true, building: { select: { name: true } } } } } } } }),
  ]);

  const byId = new Map<string, OpenInvoice & { lineSum: number; hasBalance: boolean }>();
  const add = (r: (typeof units)[number] | (typeof lines)[number] | (typeof months)[number], title: string, href: string) => {
    const existing = byId.get(r.hubspotInvoiceId);
    if (existing) {
      existing.lineSum += r.amountCents;
      return;
    }
    const dueKey = r.dueDate ? utcDateKey(r.dueDate) : null;
    byId.set(r.hubspotInvoiceId, {
      id: r.hubspotInvoiceId,
      number: r.invoiceNumber,
      title,
      href,
      dueKey,
      daysLate: dueKey ? daysBetween(dueKey, todayKey) : 0,
      balanceCents: r.balanceDueCents ?? r.invoiceTotalCents ?? 0,
      hasBalance: r.balanceDueCents != null || r.invoiceTotalCents != null,
      lineSum: r.amountCents,
    });
  };
  for (const r of units) add(r, `${r.building.name} - Unit ${r.unitNumber}`, `/erp/buildings/${r.building.id}`);
  for (const r of lines) add(r, r.project.jobTitle, `/erp/projects/${r.project.id}`);
  for (const r of months) add(r, `${r.period.recurringContract.building.name} (monthly)`, `/erp/janitorial/contracts/${r.period.recurringContract.id}`);

  return [...byId.values()]
    .map(({ lineSum, hasBalance, ...inv }) => ({ ...inv, balanceCents: hasBalance ? inv.balanceCents : lineSum }))
    .filter((i) => i.balanceCents > 0)
    .sort((a, b) => b.daysLate - a.daysLate);
});

/** Open invoices past their due date, the same test as the Billing page's invoice chips. */
async function loadOverdueInvoices(todayKey: string): Promise<OverdueInvoice[]> {
  return (await loadOpenInvoices(todayKey)).filter((i): i is OverdueInvoice => !!i.dueKey && i.daysLate > 0);
}

function overdueSection(invoices: OverdueInvoice[]): CardSection {
  const totals = new Map<string, number>();
  for (const i of invoices) totals.set(bucketOf(i.daysLate), (totals.get(bucketOf(i.daysLate)) ?? 0) + i.balanceCents);
  const total = invoices.reduce((s, i) => s + i.balanceCents, 0);
  return {
    key: "overdue",
    label: "Overdue",
    alertCount: invoices.length,
    rows: invoices.map((i) => ({
      id: i.id,
      href: i.href,
      title: i.title,
      note: `${i.number ? `Invoice ${i.number} · ` : ""}due ${shortDate(i.dueKey)}`,
      value: centsToDollarsCompact(i.balanceCents),
      valueTitle: centsToDollars(i.balanceCents),
      negative: true,
      secondary: `${i.daysLate}d`,
      group: `${bucketOf(i.daysLate)} · ${centsToDollarsCompact(totals.get(bucketOf(i.daysLate)) ?? 0)}`,
    })),
    empty: "No overdue invoices.",
    footer: invoices.length ? `${centsToDollarsCompact(total)} overdue in total` : undefined,
    href: "/erp/billing",
  };
}

// ── Ready to bill ──────────────────────────────────────────────────────────

export type BillItem = { id: string; title: string; note: string; href: string; cents: number | null; doneKey: string };

/**
 * Finished work still marked Not billed, since BILLING_DATA_START: units,
 * SOV lines, change orders, projects with no SOV lines, and janitorial
 * months that have started. Same status rules as the Billing page.
 */
export const loadReadyToBill = cache(async (todayKey: string): Promise<BillItem[]> => {
  const since = new Date(`${BILLING_DATA_START}T00:00:00Z`);
  const [units, sovItems, changeOrders, plainProjects, months] = await Promise.all([
    prisma.project.findMany({
      where: {
        status: "COMPLETE",
        turnoverRequestId: { not: null },
        OR: [{ turnoverCompletedAt: { gte: since } }, { turnoverCompletedAt: null, projectEndDate: { gte: since } }],
      },
      select: {
        id: true, jobTitle: true, contractValueCents: true, billingStatus: true, turnoverCompletedAt: true, projectEndDate: true,
        turnoverRequest: { select: { billingStatus: true } },
      },
    }),
    prisma.projectSOVItem.findMany({
      where: { completed: true, billingStatus: "NOT_BILLED", OR: [{ completedAt: { gte: since } }, { completedAt: null, updatedAt: { gte: since } }] },
      select: { id: true, description: true, scheduledValueCents: true, completedAt: true, updatedAt: true, sov: { select: { project: { select: { id: true, jobTitle: true } } } } },
    }),
    prisma.projectChangeOrder.findMany({
      where: { status: { in: ["COMPLETED", "BILLING"] }, OR: [{ completedAt: { gte: since } }, { completedAt: null, updatedAt: { gte: since } }] },
      select: { id: true, title: true, billingStatus: true, contractValueCents: true, completedAt: true, updatedAt: true, project: { select: { id: true, jobTitle: true } } },
    }),
    prisma.project.findMany({
      where: {
        status: "COMPLETE",
        turnoverRequestId: null,
        recurringContractPeriodId: null,
        projectEndDate: { gte: since },
        sov: { is: null },
      },
      select: { id: true, jobTitle: true, contractValueCents: true, billingStatus: true, projectEndDate: true },
    }),
    prisma.recurringContractPeriod.findMany({
      where: { billingStatus: "NOT_BILLED", periodStart: { gte: since, lte: new Date(`${todayKey}T00:00:00Z`) } },
      select: { id: true, periodStart: true, amountCents: true, recurringContract: { select: { id: true, building: { select: { name: true } } } } },
    }),
  ]);
  // A project with an SOV but no lines bills as a whole, like one without an SOV.
  const emptySovProjects = await prisma.project.findMany({
    where: { status: "COMPLETE", turnoverRequestId: null, recurringContractPeriodId: null, projectEndDate: { gte: since }, sov: { is: { items: { none: {} } } } },
    select: { id: true, jobTitle: true, contractValueCents: true, billingStatus: true, projectEndDate: true },
  });

  const items: BillItem[] = [
    ...units
      .filter((u) => normalizeBillingStatus(u.turnoverRequest?.billingStatus ?? u.billingStatus) === "NOT_BILLED")
      .map((u) => ({
        id: `unit-${u.id}`, title: u.jobTitle, note: "Unit turn", href: `/erp/projects/${u.id}`, cents: u.contractValueCents,
        doneKey: u.turnoverCompletedAt ? todayEasternKey(u.turnoverCompletedAt) : utcDateKey(u.projectEndDate!),
      })),
    ...sovItems.map((i) => ({
      id: `sov-${i.id}`, title: i.sov.project.jobTitle, note: `SOV line: ${i.description}`, href: `/erp/projects/${i.sov.project.id}`,
      cents: i.scheduledValueCents, doneKey: utcDateKey(i.completedAt ?? i.updatedAt),
    })),
    ...changeOrders
      .filter((co) => normalizeBillingStatus(co.billingStatus) === "NOT_BILLED")
      .map((co) => ({
        id: `co-${co.id}`, title: co.project.jobTitle, note: `Change order: ${co.title}`, href: `/erp/projects/${co.project.id}/change-orders/${co.id}`,
        cents: co.contractValueCents, doneKey: utcDateKey(co.completedAt ?? co.updatedAt),
      })),
    ...[...plainProjects, ...emptySovProjects]
      .filter((p) => normalizeBillingStatus(p.billingStatus) === "NOT_BILLED")
      .map((p) => ({
        id: `project-${p.id}`, title: p.jobTitle, note: "Whole project", href: `/erp/projects/${p.id}`, cents: p.contractValueCents,
        doneKey: utcDateKey(p.projectEndDate!),
      })),
    ...months.map((m) => ({
      id: `month-${m.id}`, title: m.recurringContract.building.name, note: `Janitorial month, ${new Date(m.periodStart).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" })}`,
      href: `/erp/janitorial/contracts/${m.recurringContract.id}`, cents: m.amountCents, doneKey: utcDateKey(m.periodStart),
    })),
  ];
  return items.sort((a, b) => a.doneKey.localeCompare(b.doneKey));
});

function readyToBillSection(items: BillItem[], todayKey: string): CardSection {
  const total = items.reduce((s, i) => s + (i.cents ?? 0), 0);
  return {
    key: "ready",
    label: "Ready to bill",
    rows: items.map((i) => ({
      id: i.id,
      href: i.href,
      title: i.title,
      note: `${i.note} · done ${shortDate(i.doneKey)}`,
      value: i.cents != null ? centsToDollarsCompact(i.cents) : "No price",
      valueTitle: i.cents != null ? centsToDollars(i.cents) : undefined,
      secondary: `${daysBetween(i.doneKey, todayKey)}d`,
    })),
    empty: "Everything finished has been billed.",
    footer: items.length ? `${centsToDollarsCompact(total)} to bill` : undefined,
    href: "/erp/billing",
  };
}

// ── Payroll lock ───────────────────────────────────────────────────────────

type PayrollPeriodState = { label: string; startKey: string; endKey: string; locked: boolean; ended: boolean };

const loadPayrollPeriods = cache(async (todayKey: string): Promise<PayrollPeriodState[]> => {
  const anchor = (await prisma.appSetting.findUnique({ where: { key: "payrollAnchor" } }))?.value ?? DEFAULT_PAYROLL_ANCHOR;
  const current = payPeriodForDay(todayKey, anchor);
  const previous = { start: new Date(current.start.getTime() - TWO_WEEKS_MS), end: new Date(current.start.getTime() - 1) };
  // The close is saved under the period's first day; allow a day either way
  // for how that day was turned into a timestamp.
  const closes = await prisma.payrollPeriodClose.findMany({
    where: { periodStart: { gte: new Date(previous.start.getTime() - DAY_MS), lte: new Date(current.start.getTime() + DAY_MS) } },
    select: { periodStart: true },
  });
  const isLocked = (start: Date) => closes.some((c) => Math.abs(c.periodStart.getTime() - start.getTime()) <= DAY_MS);
  return [
    { label: "Last period", startKey: utcDateKey(previous.start), endKey: utcDateKey(previous.end), locked: isLocked(previous.start), ended: true },
    { label: "This period", startKey: utcDateKey(current.start), endKey: utcDateKey(current.end), locked: isLocked(current.start), ended: false },
  ];
});

function payrollSection(periods: PayrollPeriodState[]): CardSection {
  const unlocked = periods.filter((p) => p.ended && !p.locked).length;
  return {
    key: "payroll",
    label: "Payroll",
    alertCount: unlocked,
    rows: periods.map((p) => ({
      id: p.startKey,
      href: "/erp/payroll",
      title: p.label,
      note: `${shortDate(p.startKey)} - ${shortDate(p.endKey)}`,
      value: p.locked ? "Locked" : p.ended ? "Not locked" : "In progress",
      negative: p.ended && !p.locked,
    })),
    empty: "No pay periods.",
    href: "/erp/payroll",
  };
}

// ── Liens ──────────────────────────────────────────────────────────────────

const loadLienRows = cache(async (todayKey: string): Promise<{ rows: JobTabRow[]; urgent: number }> => {
  const watch = await loadLienWatch();
  const horizon = addDaysKey(todayKey, LIEN_WINDOW_DAYS);
  const due = watch
    .filter((r) => r.deadline && r.readiness && !lienDecisionCloses(r.decision?.value) && r.readiness.stage !== "TOO_LATE")
    .filter((r) => {
      const d = r.deadline!;
      const nextStep = [d.noticeByKey, d.decideByKey, d.deadlineKey].filter((k): k is string => !!k && k >= todayKey).sort()[0];
      return r.readiness!.stage !== "NOT_DUE" || (!!nextStep && nextStep <= horizon);
    })
    .sort((a, b) => a.deadline!.deadlineKey.localeCompare(b.deadline!.deadlineKey));
  return {
    urgent: due.filter((r) => URGENT_LIEN_STAGES.includes(r.readiness!.stage)).length,
    rows: due.map((r) => ({
      id: r.projectId,
      href: `/erp/projects/${r.projectId}`,
      title: r.jobTitle,
      note: `${centsToDollarsCompact(r.unpaidCents)} unpaid · file by ${shortDate(r.deadline!.deadlineKey)}`,
      value: lienPillLabel(r.deadline!, r.readiness!),
      negative: URGENT_LIEN_STAGES.includes(r.readiness!.stage) || r.readiness!.stage === "NOTICE_MISSED",
    })),
  };
});

// ── Needs action card ──────────────────────────────────────────────────────

export async function loadNeedsAction(role: ErpRole): Promise<DashboardCardData> {
  const todayKey = todayEasternKey();
  const showPayroll = canSeePayroll(role);
  const [overdue, ready, periods, liens] = await Promise.all([
    loadOverdueInvoices(todayKey),
    loadReadyToBill(todayKey),
    showPayroll ? loadPayrollPeriods(todayKey) : Promise.resolve(null),
    loadLienRows(todayKey),
  ]);
  const sections: CardSection[] = [
    overdueSection(overdue),
    readyToBillSection(ready, todayKey),
    ...(periods ? [payrollSection(periods)] : []),
    { key: "liens", label: "Liens", alertCount: liens.urgent, rows: liens.rows, empty: `No lien steps due in the next ${LIEN_WINDOW_DAYS} days.`, href: "/erp/billing" },
  ];
  return { alertCount: sections.reduce((s, sec) => s + (sec.alertCount ?? 0), 0), sections };
}

/** Red number on the Money tab: overdue invoices + last pay period not locked + liens needing a step now. */
export async function countNeedsActionAlerts(role: ErpRole): Promise<number> {
  const todayKey = todayEasternKey();
  const [overdue, periods, liens] = await Promise.all([
    loadOverdueInvoices(todayKey),
    canSeePayroll(role) ? loadPayrollPeriods(todayKey) : Promise.resolve([]),
    loadLienRows(todayKey),
  ]);
  return overdue.length + periods.filter((p) => p.ended && !p.locked).length + liens.urgent;
}

// ── Checks card: losing money ──────────────────────────────────────────────

async function loadLosingMoney(): Promise<JobTabRow[]> {
  const laborSelect = { id: true, employeeId: true, workDate: true, createdAt: true, hours: true, hourlyRateCents: true } as const;
  const projects = await prisma.project.findMany({
    where: { status: { notIn: PROJECT_DONE }, contractValueCents: { not: null } },
    select: {
      id: true, jobTitle: true, contractValueCents: true, estLaborCents: true, estMaterialCents: true, estTravelCents: true,
      actualLaborCents: true, actualMaterialCents: true, actualTravelCents: true,
      laborEntries: { select: laborSelect },
      materialEntries: { select: { costCents: true } },
      contractorAssignments: { select: { costCents: true } },
      changeOrders: {
        select: {
          status: true, contractValueCents: true, estimatedCostCents: true,
          actualLaborCents: true, actualMaterialCents: true, actualTravelCents: true,
          materialEntries: { select: { costCents: true } },
          laborers: { select: laborSelect },
          contractorAssignments: { select: { costCents: true } },
        },
      },
    },
  });
  const actuals = await computeProjectActualsWithChangeOrders(projects);

  type Flag = { row: JobTabRow; severity: number };
  const flags = projects.flatMap((p): Flag[] => {
    const a = actuals.get(p.id);
    if (!a || a.contractValueCents == null) return [];
    const cost = a.actualLaborCents + a.actualMaterialCents + a.actualTravelCents;
    if (cost <= 0) return [];
    // Already costing more than it's worth: losing money no matter what's left.
    if (cost > a.contractValueCents) {
      const loss = cost - a.contractValueCents;
      return [{
        severity: 1e12 + loss,
        row: {
          id: p.id, href: `/erp/projects/${p.id}`, title: p.jobTitle,
          note: `Cost ${centsToDollarsCompact(cost)} vs price ${centsToDollarsCompact(a.contractValueCents)}`,
          value: `-${centsToDollarsCompact(loss)}`, valueTitle: centsToDollars(-loss), negative: true, group: "Costing more than the price",
        },
      }];
    }
    // Still open but already past what it was estimated to cost in total.
    const hasEstimate = p.estLaborCents != null || p.estMaterialCents != null;
    const coEstimates = p.changeOrders.filter(isQualifyingChangeOrder).reduce((s, co) => s + (co.estimatedCostCents ?? 0), 0);
    const est = (p.estLaborCents ?? 0) + (p.estMaterialCents ?? 0) + (p.estTravelCents ?? 0) + coEstimates;
    if (hasEstimate && est > 0 && cost > est) {
      const over = cost - est;
      return [{
        severity: over,
        row: {
          id: p.id, href: `/erp/projects/${p.id}`, title: p.jobTitle,
          note: `Cost ${centsToDollarsCompact(cost)} vs estimate ${centsToDollarsCompact(est)} · ${Math.round(((a.contractValueCents - cost) / a.contractValueCents) * 100)}% margin left`,
          value: `${Math.round((over / est) * 100)}% over`, negative: true, group: "Past its estimate, still open",
        },
      }];
    }
    return [];
  });
  return flags.sort((a, b) => b.severity - a.severity).map((f) => f.row);
}

// ── Checks card: reconciliation ────────────────────────────────────────────

/**
 * Two ways HubSpot and the ERP can drift apart:
 * - a HubSpot invoice the sync saw but couldn't place, and nobody has linked by hand since;
 * - an ERP line marked Billed (not yet paid) with no HubSpot invoice linked to it.
 */
async function loadReconciliation(todayKey: string): Promise<JobTabRow[]> {
  const since = new Date(`${BILLING_DATA_START}T00:00:00Z`);
  const graceCutoff = new Date(Date.parse(`${todayKey}T00:00:00Z`) - UNLINKED_GRACE_DAYS * DAY_MS);

  const [pending, unitLinks, sovLinks, contractLinks] = await Promise.all([
    prisma.hubSpotInvoiceLineItemMatch.findMany({
      where: { status: "PENDING_REVIEW" },
      select: {
        hubspotInvoiceId: true, amountCents: true, createdAt: true,
        project: { select: { id: true, jobTitle: true } }, building: { select: { id: true, name: true } },
      },
    }),
    prisma.hubSpotUnitInvoice.findMany({ where: { status: { not: "voided" } }, select: { hubspotInvoiceId: true, turnoverRequestId: true } }),
    prisma.hubSpotSovInvoice.findMany({ where: { status: { not: "voided" } }, select: { hubspotInvoiceId: true, sovItemId: true, changeOrderId: true } }),
    prisma.hubSpotContractInvoice.findMany({ where: { status: { not: "voided" } }, select: { hubspotInvoiceId: true, periodId: true } }),
  ]);
  const linkedInvoiceIds = new Set([...unitLinks, ...sovLinks, ...contractLinks].map((l) => l.hubspotInvoiceId));

  // HubSpot invoices not placed anywhere in the ERP, one row per invoice.
  const unplaced = new Map<string, { title: string; href: string; cents: number; lines: number; firstKey: string }>();
  for (const m of pending) {
    // Older than the trusted billing data: the sync's first pass over history.
    if (linkedInvoiceIds.has(m.hubspotInvoiceId) || m.createdAt < since) continue;
    const firstKey = utcDateKey(m.createdAt);
    const row = unplaced.get(m.hubspotInvoiceId);
    if (row) {
      row.cents += m.amountCents;
      row.lines += 1;
      if (firstKey < row.firstKey) row.firstKey = firstKey;
      continue;
    }
    unplaced.set(m.hubspotInvoiceId, {
      title: m.project?.jobTitle ?? m.building?.name ?? "No building or project matched",
      href: m.project ? `/erp/projects/${m.project.id}` : m.building ? `/erp/buildings/${m.building.id}` : "/erp/billing",
      cents: m.amountCents,
      lines: 1,
      firstKey,
    });
  }
  const unplacedRows: JobTabRow[] = [...unplaced.entries()]
    .sort((a, b) => a[1].firstKey.localeCompare(b[1].firstKey))
    .map(([id, r]) => ({
      id: `hs-${id}`, href: r.href, title: r.title,
      note: `${r.lines} line${r.lines === 1 ? "" : "s"} · first seen ${shortDate(r.firstKey)}`,
      value: centsToDollarsCompact(r.cents), valueTitle: centsToDollars(r.cents), group: "HubSpot invoice, not linked in the ERP",
    }));

  // ERP lines marked Billed with nothing linked.
  const linkedTurnovers = new Set(unitLinks.flatMap((l) => l.turnoverRequestId ?? []));
  const linkedSovItems = new Set(sovLinks.flatMap((l) => l.sovItemId ?? []));
  const linkedChangeOrders = new Set(sovLinks.flatMap((l) => l.changeOrderId ?? []));
  const linkedPeriods = new Set(contractLinks.map((l) => l.periodId));
  const doneWindow = { gte: since, lte: graceCutoff };
  const [units, sovItems, changeOrders, months] = await Promise.all([
    prisma.project.findMany({
      where: { status: "COMPLETE", turnoverRequestId: { not: null }, OR: [{ turnoverCompletedAt: doneWindow }, { turnoverCompletedAt: null, projectEndDate: doneWindow }] },
      select: {
        id: true, billingStatus: true, contractValueCents: true, turnoverRequestId: true,
        turnoverRequest: { select: { billingStatus: true, building: { select: { id: true, name: true } } } },
      },
    }),
    prisma.projectSOVItem.findMany({
      where: { completed: true, billingStatus: "BILLED", OR: [{ completedAt: doneWindow }, { completedAt: null, updatedAt: doneWindow }] },
      select: { id: true, description: true, scheduledValueCents: true, sov: { select: { project: { select: { id: true, jobTitle: true } } } } },
    }),
    prisma.projectChangeOrder.findMany({
      where: { status: { in: ["COMPLETED", "BILLING"] }, OR: [{ completedAt: doneWindow }, { completedAt: null, updatedAt: doneWindow }] },
      select: { id: true, title: true, billingStatus: true, contractValueCents: true, project: { select: { id: true, jobTitle: true } } },
    }),
    prisma.recurringContractPeriod.findMany({
      where: { billingStatus: "BILLED", periodStart: doneWindow },
      select: { id: true, periodStart: true, amountCents: true, recurringContract: { select: { id: true, building: { select: { name: true } } } } },
    }),
  ]);
  const group = "Billed in the ERP, no invoice linked";
  // Unit turns roll up to one row per building: invoices are linked on the
  // building's Invoices & Quotes tab, and one row per unit would bury the rest.
  const unlinkedByBuilding = new Map<string, { name: string; units: number; cents: number }>();
  for (const u of units) {
    const building = u.turnoverRequest?.building;
    if (!building || linkedTurnovers.has(u.turnoverRequestId!)) continue;
    if (normalizeBillingStatus(u.turnoverRequest?.billingStatus ?? u.billingStatus) !== "BILLED") continue;
    const row = unlinkedByBuilding.get(building.id) ?? { name: building.name, units: 0, cents: 0 };
    row.units += 1;
    row.cents += u.contractValueCents ?? 0;
    unlinkedByBuilding.set(building.id, row);
  }
  const billedRows: JobTabRow[] = [
    ...[...unlinkedByBuilding.entries()]
      .sort((a, b) => b[1].units - a[1].units)
      .map(([buildingId, b]) => ({
        id: `units-${buildingId}`, href: `/erp/buildings/${buildingId}`, title: b.name,
        note: `${b.units} unit turn${b.units === 1 ? "" : "s"}`, value: centsToDollarsCompact(b.cents), valueTitle: centsToDollars(b.cents), group,
      })),
    ...sovItems
      .filter((i) => !linkedSovItems.has(i.id))
      .map((i) => ({ id: `sov-${i.id}`, href: `/erp/projects/${i.sov.project.id}`, title: i.sov.project.jobTitle, note: `SOV line: ${i.description}`, value: centsToDollarsCompact(i.scheduledValueCents), group })),
    ...changeOrders
      .filter((co) => normalizeBillingStatus(co.billingStatus) === "BILLED" && !linkedChangeOrders.has(co.id))
      .map((co) => ({ id: `co-${co.id}`, href: `/erp/projects/${co.project.id}/change-orders/${co.id}`, title: co.project.jobTitle, note: `Change order: ${co.title}`, value: co.contractValueCents != null ? centsToDollarsCompact(co.contractValueCents) : "No price", group })),
    ...months
      .filter((m) => !linkedPeriods.has(m.id))
      .map((m) => ({ id: `month-${m.id}`, href: `/erp/janitorial/contracts/${m.recurringContract.id}`, title: m.recurringContract.building.name, note: `Janitorial month, ${new Date(m.periodStart).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" })}`, value: centsToDollarsCompact(m.amountCents), group })),
  ];

  return [...unplacedRows, ...billedRows];
}

export async function loadChecks(): Promise<DashboardCardData> {
  const todayKey = todayEasternKey();
  const [losing, recon] = await Promise.all([loadLosingMoney(), loadReconciliation(todayKey)]);
  return {
    sections: [
      { key: "losing", label: "Losing money", rows: losing, empty: "No open job is over its price or its estimate.", href: "/erp/projects" },
      {
        key: "reconcile",
        label: "Reconciliation",
        rows: recon,
        empty: "HubSpot and the ERP agree.",
        footer: `Since ${shortDate(BILLING_DATA_START)}`,
        href: "/erp/billing",
      },
    ],
  };
}
