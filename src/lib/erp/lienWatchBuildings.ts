/**
 * Janitorial unit turns that are finished but not paid, grouped per building,
 * and how long is left to file a lien. A lien is filed against the property,
 * not an apartment, so the building is the unit of tracking: one state, one
 * owner, one decision. Each turn still has its own clock (a turn can count as
 * its own contract), so the building's deadline is the earliest one among
 * turns that are still in time. Recurring janitorial months are left out
 * (plain cleaning).
 */

import { prisma } from "@/lib/prisma";
import { isPaidStatus } from "./billingStatus";
import { todayEasternKey, utcDateKey } from "./dates";
import { detectLienState, lienDeadline, lienReadiness, parseLienDecision, parseLienManualSteps, parseLienRole, parseLienState } from "./lienDeadline";
import { loadLienWatch, type LienWatchRow, type LienWatchUnit } from "./lienWatch";

/**
 * Pass a buildingId to get that one building whether or not it has anything
 * unpaid. Otherwise returns every building with an unpaid finished turn.
 */
export async function loadBuildingLienWatch(opts: { buildingId?: string } = {}): Promise<LienWatchRow[]> {
  const todayKey = todayEasternKey();
  const turns = await prisma.project.findMany({
    where: {
      status: { not: "ARCHIVED" },
      recurringContractPeriodId: null,
      turnoverRequest: opts.buildingId ? { buildingId: opts.buildingId } : { isNot: null },
    },
    select: {
      id: true,
      status: true,
      billingStatus: true,
      contractValueCents: true,
      projectEndDate: true,
      turnoverCompletedAt: true,
      turnoverRequest: { select: { id: true, buildingId: true, unitNumber: true, billingStatus: true, approvedPriceCents: true, priceCents: true } },
      changeOrders: { where: { status: { in: ["BILLING", "COMPLETED"] } }, select: { billingStatus: true, contractValueCents: true } },
    },
  });

  // What's unpaid on each finished turn: its own price (same amount and
  // status as the Janitorial billing tab) plus its change orders.
  type Turn = (typeof turns)[number] & { unpaidCents: number; completedKey: string | null };
  const byBuilding = new Map<string, Turn[]>();
  for (const t of turns) {
    const tr = t.turnoverRequest!;
    let unpaid = 0;
    if (t.status === "COMPLETE" && !isPaidStatus(tr.billingStatus ?? t.billingStatus)) {
      unpaid += tr.approvedPriceCents ?? tr.priceCents ?? t.contractValueCents ?? 0;
    }
    for (const co of t.changeOrders) if (!isPaidStatus(co.billingStatus)) unpaid += co.contractValueCents ?? 0;
    if (unpaid <= 0) continue;
    // The completed date is a moment in time, read as the Eastern day, same as Billing.
    const completedKey =
      t.status !== "COMPLETE" ? null : t.turnoverCompletedAt ? todayEasternKey(t.turnoverCompletedAt) : t.projectEndDate ? utcDateKey(t.projectEndDate) : null;
    byBuilding.set(tr.buildingId, [...(byBuilding.get(tr.buildingId) ?? []), { ...t, unpaidCents: unpaid, completedKey }]);
  }

  const buildingIds = opts.buildingId ? [opts.buildingId] : [...byBuilding.keys()];
  if (buildingIds.length === 0) return [];
  const allTurns = [...byBuilding.values()].flat();
  const [buildings, unitLinks, coLinks] = await Promise.all([
    prisma.building.findMany({
      where: { id: { in: buildingIds } },
      select: {
        id: true,
        name: true,
        address: true,
        lienState: true,
        lienRole: true,
        lienResidential: true,
        lienNoticeSentOn: true,
        lienNoticeTracking: true,
        lienOwnerName: true,
        lienOwnerAddress: true,
        lienGcName: true,
        lienGcAddress: true,
        lienSteps: true,
        lienDecision: true,
        lienDecisionNote: true,
        lienDecisionAt: true,
        lienDecisionBy: true,
        lienAlertedStage: true,
      },
    }),
    // Open invoices on these turns (unit table) and their change orders (SOV table).
    prisma.hubSpotUnitInvoice.findMany({
      where: { turnoverRequestId: { in: allTurns.map((t) => t.turnoverRequest!.id) }, status: "open" },
      select: { buildingId: true, hubspotInvoiceId: true, invoiceNumber: true, dueDate: true },
    }),
    prisma.hubSpotSovInvoice.findMany({
      where: { projectId: { in: allTurns.map((t) => t.id) }, changeOrderId: { not: null }, status: "open" },
      select: { projectId: true, hubspotInvoiceId: true, invoiceNumber: true, dueDate: true },
    }),
  ]);
  const buildingOfTurn = new Map(allTurns.map((t) => [t.id, t.turnoverRequest!.buildingId]));

  return buildings.map((b) => {
    const buildingTurns = (byBuilding.get(b.id) ?? []).sort((x, y) => (x.completedKey ?? "9999").localeCompare(y.completedKey ?? "9999"));
    // A state picked on the building wins, then its address, then its name.
    const setState = parseLienState(b.lienState);
    const addressState = setState ? null : detectLienState(b.address);
    const nameState = setState || addressState ? null : detectLienState(b.name);
    const state = setState ?? addressState ?? nameState;
    const stateSource: LienWatchRow["stateSource"] = setState ? "SET" : addressState ? "BUILDING_ADDRESS" : nameState ? "TITLE" : null;
    const deadlineFor = (key: string | null) =>
      lienDeadline({ state, role: b.lienRole, residential: b.lienResidential, lastWorkDate: key ? new Date(`${key}T00:00:00Z`) : null }, todayKey);

    const units: LienWatchUnit[] = buildingTurns.map((t) => ({
      projectId: t.id,
      unitNumber: t.turnoverRequest!.unitNumber,
      unpaidCents: t.unpaidCents,
      completedKey: t.completedKey,
      deadlineKey: deadlineFor(t.completedKey)?.deadlineKey ?? null,
    }));
    // The turn that sets the clock: the earliest deadline still ahead, since
    // those rights run out first. When every one has passed, the latest.
    const timed = units.filter((u) => u.deadlineKey);
    const open = timed.filter((u) => u.deadlineKey! >= todayKey).sort((x, y) => x.deadlineKey!.localeCompare(y.deadlineKey!));
    const driver = open[0] ?? [...timed].sort((x, y) => y.deadlineKey!.localeCompare(x.deadlineKey!))[0] ?? null;
    const deadline = driver ? deadlineFor(driver.completedKey) : null;

    const unpaidCents = units.reduce((s, u) => s + u.unpaidCents, 0);
    const noticeSentKey = b.lienNoticeSentOn ? utcDateKey(b.lienNoticeSentOn) : null;
    const decision = parseLienDecision(b.lienDecision);
    const seen = new Set<string>();
    const openInvoices = [
      ...unitLinks.filter((l) => l.buildingId === b.id),
      ...coLinks.filter((l) => buildingOfTurn.get(l.projectId) === b.id),
    ]
      .filter((l) => !seen.has(l.hubspotInvoiceId) && !!seen.add(l.hubspotInvoiceId))
      .map((l) => ({ number: l.invoiceNumber, dueKey: l.dueDate ? utcDateKey(l.dueDate) : null }));
    const readiness = deadline
      ? lienReadiness(
          deadline,
          {
            unpaidCents,
            openInvoices,
            noticeSentKey,
            noticeTracking: b.lienNoticeTracking,
            // Turns have no signed contracts in the ERP.
            hasSignedContract: false,
            decision,
            hasOwnerDetails: !!b.lienOwnerName?.trim() && !!b.lienOwnerAddress?.trim(),
            hasGcDetails: !!b.lienGcName?.trim() && !!b.lienGcAddress?.trim(),
            manual: parseLienManualSteps(b.lienSteps),
          },
          todayKey,
        )
      : null;
    const liensHref = `/erp/buildings/${b.id}?tab=Liens`;
    return {
      kind: "BUILDING" as const,
      key: `building:${b.id}`,
      projectId: null,
      buildingId: b.id,
      jobTitle: b.name,
      liensHref,
      setupHref: driver ? `/erp/projects/${driver.projectId}` : liensHref,
      units,
      unpaidCents,
      state,
      stateSource,
      role: parseLienRole(b.lienRole),
      residential: b.lienResidential,
      completedKey: driver?.completedKey ?? null,
      deadline,
      readiness,
      noticeSentKey,
      decision: decision
        ? { value: decision, note: b.lienDecisionNote, onKey: b.lienDecisionAt ? todayEasternKey(b.lienDecisionAt) : null, by: b.lienDecisionBy }
        : null,
      alertedStage: b.lienAlertedStage,
      // NOT_COMPLETE: unpaid change orders on turns that aren't finished yet.
      missing: !state ? "STATE" : driver ? null : "NOT_COMPLETE",
    };
  });
}

/** Every lien to watch: post-construction jobs, then buildings with unpaid turns. */
export async function loadAllLienWatch(): Promise<LienWatchRow[]> {
  const [jobs, buildings] = await Promise.all([loadLienWatch(), loadBuildingLienWatch()]);
  return [...jobs, ...buildings];
}
