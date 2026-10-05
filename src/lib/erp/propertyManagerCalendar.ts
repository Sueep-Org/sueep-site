/**
 * What a property manager sees on their link: the turnover units at their
 * buildings, reduced to plain dates and labels. Server only.
 */

import { prisma } from "@/lib/prisma";
import { utcDateKey } from "./dates";
import { deriveProjectLifecycle } from "./projectLifecycle";
import { contractedTurnoverScope, parseCompletedScopeItems, turnoverScopeDisplayLabel } from "./turnoverScope";
import { getTurnoverPricingPackage, type TurnoverPricingPackage } from "@/lib/turnoverPricingPackages";
import { requestLayoutFor, requestLayoutLabel, requestWorkLabels, type RequestLayoutValue, type RequestWork } from "./propertyManagerRequestShared";

/** What we know about a unit from its last turnover, to fill in the booking form. */
export type KnownUnit = { layout: RequestLayoutValue | null; work: RequestWork };

/** Finished units older than this drop off the calendar. */
const HISTORY_MONTHS = 12;

export type PmUnitStatus = "REQUESTED" | "SCHEDULED" | "IN_PROGRESS" | "ON_HOLD" | "DONE" | "DECLINED";

/** Declined requests stay on their list this long so they don't just vanish. */
const DECLINED_DAYS = 30;

export type PmBuilding = { id: string; name: string; address: string; pricingPackage: TurnoverPricingPackage };

/** A real unit, or a request staff haven't confirmed yet. */
export type PmUnit = {
  id: string;
  kind: "unit" | "request";
  buildingId: string;
  unitNumber: string;
  layout: string | null;
  status: PmUnitStatus;
  /** YYYY-MM-DD */
  start: string | null;
  end: string | null;
  moveOut: string | null;
  moveIn: string | null;
  /** Days a crew is booked, YYYY-MM-DD */
  crewDays: string[];
  scope: { label: string; done: boolean }[];
  /** For a request, the estimate */
  priceCents: number | null;
  /** Requests only: other work staff still need to price */
  hasUnpricedWork: boolean;
  notes: string | null;
  declineReason: string | null;
  /** Units only: a cancel or new date waiting on staff */
  pendingChange: { id: string; kind: "CANCEL" | "RESCHEDULE"; newStart: string | null } | null;
};

const LIFECYCLE_STATUS = { UPCOMING: "SCHEDULED", ACTIVE: "IN_PROGRESS", ON_HOLD: "ON_HOLD", COMPLETED: "DONE" } as const;

function layoutLabel(tr: { bedrooms: number | null; bathrooms: number | null; isPartialTurn: boolean; partialTurnLayout: string | null }): string | null {
  if (tr.bedrooms == null && tr.bathrooms == null) return null;
  const base = tr.bedrooms === 0 ? "Studio" : `${tr.bedrooms ?? "?"} bed / ${tr.bathrooms ?? "?"} bath`;
  return tr.isPartialTurn && tr.partialTurnLayout ? `${base}, turning ${tr.partialTurnLayout}` : base;
}

/** Key for knownLayouts: building id plus the unit number, ignoring case. */
export function unitKey(buildingId: string, unitNumber: string): string {
  return `${buildingId}|${unitNumber.trim().replace(/^#/, "").toLowerCase()}`;
}

export async function loadPropertyManagerCalendar(managerId: string): Promise<{
  buildings: PmBuilding[];
  units: PmUnit[];
  /** Each unit's size and work from its last turnover, keyed by unitKey, so the booking form can fill them in */
  knownUnits: Record<string, KnownUnit>;
}> {
  const links = await prisma.propertyManagerBuilding.findMany({
    where: { propertyManagerId: managerId },
    select: { building: { select: { id: true, name: true, address: true, pricingPackage: true } } },
    orderBy: { building: { name: "asc" } },
  });
  const buildings = links.map(({ building: b }) => ({
    id: b.id,
    name: b.name,
    address: b.address,
    pricingPackage: getTurnoverPricingPackage(b.name, b.pricingPackage),
  }));
  const buildingIds = buildings.map((b) => b.id);
  if (!buildingIds.length) return { buildings, units: [], knownUnits: {} };
  const managerEmail = (await prisma.propertyManager.findUnique({ where: { id: managerId }, select: { email: true } }))?.email ?? "";

  const [units, requests, past] = await Promise.all([
    loadUnitsForBuildings(buildingIds),
    prisma.propertyManagerRequest.findMany({
      where: {
        buildingId: { in: buildingIds },
        // Website requests only show to whoever's email was typed on them, since anyone can fill in that form.
        AND: [{ OR: [{ source: "PORTAL" }, { requesterEmail: managerEmail }] }],
        OR: [{ status: "REQUESTED" }, { status: "DECLINED", decidedAt: { gte: new Date(Date.now() - DECLINED_DAYS * 864e5) } }],
      },
      orderBy: { requestedStartDate: "asc" },
    }),
    prisma.turnoverRequest.findMany({
      where: { buildingId: { in: buildingIds }, unitNumber: { not: null } },
      orderBy: { createdAt: "asc" },
      select: {
        buildingId: true,
        unitNumber: true,
        bedrooms: true,
        bathrooms: true,
        fullClean: true,
        fullPaint: true,
        touchUpPaint: true,
        carpetCleaning: true,
      },
    }),
  ]);

  const knownUnits: Record<string, KnownUnit> = {};
  // Oldest first, so the latest turnover of each unit wins.
  for (const t of past) {
    if (!t.unitNumber) continue;
    knownUnits[unitKey(t.buildingId, t.unitNumber)] = {
      layout: requestLayoutFor(t.bedrooms, t.bathrooms),
      work: { fullClean: t.fullClean, fullPaint: t.fullPaint, touchUpPaint: (t.touchUpPaint ?? 0) > 0 && !t.fullPaint, carpetCleaning: t.carpetCleaning },
    };
  }

  const requested: PmUnit[] = requests.map((r) => ({
    id: r.id,
    kind: "request",
    buildingId: r.buildingId,
    unitNumber: r.unitNumber,
    layout: requestLayoutLabel(r.bedrooms, r.bathrooms, r.isCommonArea),
    status: r.status === "DECLINED" ? "DECLINED" : "REQUESTED",
    start: utcDateKey(r.requestedStartDate),
    end: null,
    moveOut: r.moveOutDate ? utcDateKey(r.moveOutDate) : null,
    moveIn: r.moveInDate ? utcDateKey(r.moveInDate) : null,
    crewDays: [],
    scope: requestWorkLabels(r).map((label) => ({ label, done: false })),
    priceCents: r.estimateCents,
    hasUnpricedWork: r.otherWork,
    notes: r.notes,
    declineReason: r.declineReason,
    pendingChange: null,
  }));

  const openChanges = await prisma.propertyManagerChange.findMany({
    where: { projectId: { in: units.map((u) => u.id) }, status: "OPEN" },
    select: { id: true, projectId: true, kind: true, newStartDate: true },
  });
  const changeByProject = new Map(openChanges.map((c) => [c.projectId, c]));
  for (const u of units) {
    const c = changeByProject.get(u.id);
    if (c) u.pendingChange = { id: c.id, kind: c.kind === "CANCEL" ? "CANCEL" : "RESCHEDULE", newStart: c.newStartDate ? utcDateKey(c.newStartDate) : null };
  }

  return { buildings, units: [...requested, ...units], knownUnits };
}

/** Turnover units at these buildings: everything open, plus what finished in the last year. */
export async function loadUnitsForBuildings(buildingIds: string[]): Promise<PmUnit[]> {
  if (!buildingIds.length) return [];

  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - HISTORY_MONTHS);

  const projects = await prisma.project.findMany({
    where: {
      buildingId: { in: buildingIds },
      segment: "JANITORIAL_TURNOVER_REQUESTS",
      turnoverRequestId: { not: null },
      status: { not: "ARCHIVED" },
      OR: [{ status: { not: "COMPLETE" } }, { projectDate: { gte: cutoff } }, { turnoverCompletedAt: { gte: cutoff } }],
    },
    orderBy: [{ projectDate: "asc" }],
    select: {
      id: true,
      buildingId: true,
      status: true,
      projectDate: true,
      projectEndDate: true,
      contractValueCents: true,
      dayAssignments: { select: { date: true }, orderBy: { date: "asc" } },
      turnoverRequest: {
        select: {
          unitNumber: true,
          bedrooms: true,
          bathrooms: true,
          isPartialTurn: true,
          partialTurnLayout: true,
          moveOutDate: true,
          moveInDate: true,
          priceCents: true,
          approvedPriceCents: true,
          completedScopeItems: true,
          fullClean: true,
          fullPaint: true,
          touchUpPaint: true,
          carpetCleaning: true,
          ceilingPaint: true,
          materialsAdditional: true,
          compounding: true,
          otherWork: true,
          otherDescription: true,
        },
      },
    },
  });

  return projects.flatMap((p) => {
    const tr = p.turnoverRequest;
    if (!tr || !p.buildingId) return [];
    const status = LIFECYCLE_STATUS[deriveProjectLifecycle(p.status, p.projectDate?.toISOString() ?? null)];
    const done = new Set(parseCompletedScopeItems(tr.completedScopeItems));
    return [
      {
        id: p.id,
        kind: "unit" as const,
        buildingId: p.buildingId,
        unitNumber: tr.unitNumber?.trim() || "Unit",
        layout: layoutLabel(tr),
        status,
        start: p.projectDate ? utcDateKey(p.projectDate) : null,
        end: p.projectEndDate ? utcDateKey(p.projectEndDate) : null,
        moveOut: tr.moveOutDate ? utcDateKey(tr.moveOutDate) : null,
        moveIn: tr.moveInDate ? utcDateKey(tr.moveInDate) : null,
        crewDays: [...new Set(p.dayAssignments.map((d) => utcDateKey(d.date)))],
        scope: contractedTurnoverScope(tr).map((value) => ({
          label: turnoverScopeDisplayLabel(value, tr.otherDescription),
          done: status === "DONE" || done.has(value),
        })),
        priceCents: tr.approvedPriceCents ?? tr.priceCents ?? p.contractValueCents ?? null,
        hasUnpricedWork: false,
        notes: null,
        declineReason: null,
        pendingChange: null,
      },
    ];
  });
}
