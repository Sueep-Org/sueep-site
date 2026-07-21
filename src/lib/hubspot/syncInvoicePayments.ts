import { prisma } from "@/lib/prisma";
import { syncSovPercentDone, syncProjectBillingFromSOV, syncProjectBillingFromRequest } from "@/lib/sovSync";
import { combinedLineItemText, matchSovItem, matchUnitNumber, amountReconciles } from "@/lib/hubspot/billingMatch";
import {
  searchPaidInvoices,
  fetchAssociatedDealId,
  listAssociatedLineItemIds,
  fetchLineItemsByIds,
  type HubSpotLineItemRecord,
} from "@/lib/hubspot/invoices";

const SETTLED_STATUSES = new Set(["AUTO_APPLIED", "ALIAS_APPLIED", "RESOLVED", "IGNORED", "ALREADY_PAID_SKIPPED"]);

function parseAmountCents(raw: string | null | undefined): number {
  const n = raw ? Number.parseFloat(raw) : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

type LineItemContext = {
  li: HubSpotLineItemRecord;
  haystack: string;
  amountCents: number;
  existing: { status: string; lineItemText: string; amountCents: number } | null;
};

type SovResolution = {
  kind: "sov";
  li: HubSpotLineItemRecord;
  haystack: string;
  amountCents: number;
  sovItemId: string | null;
  matchMethod: "ALIAS" | "SCORE" | null;
  matchScore: number | null;
  candidatesJson: unknown;
};

type UnitResolution = {
  kind: "unit";
  li: HubSpotLineItemRecord;
  haystack: string;
  amountCents: number;
  unitNumber: string | null;
  matchMethod: "ALIAS" | "SCORE" | null;
  matchScore: number | null;
  candidatesJson: unknown;
};

/** Resolves what a project-scoped (SOV) line item matches to — alias first, then scoring. */
async function resolveSovLineItem(ctx: LineItemContext, projectId: string): Promise<SovResolution> {
  const { li, haystack, amountCents } = ctx;

  if (ctx.existing && SETTLED_STATUSES.has(ctx.existing.status) && ctx.existing.lineItemText === haystack && ctx.existing.amountCents === amountCents) {
    const prior = await prisma.hubSpotInvoiceLineItemMatch.findUnique({ where: { hubspotLineItemId: li.id } });
    return {
      kind: "sov",
      li,
      haystack,
      amountCents,
      sovItemId: prior?.matchedSovItemId ?? null,
      matchMethod: (prior?.matchMethod as "ALIAS" | "SCORE" | null) ?? null,
      matchScore: prior?.matchScore ?? null,
      candidatesJson: prior?.candidatesJson ?? null,
    };
  }

  const alias = await prisma.hubSpotSovAlias.findUnique({
    where: { projectId_hubspotText: { projectId, hubspotText: haystack } },
  });
  if (alias && alias.active) {
    return { kind: "sov", li, haystack, amountCents, sovItemId: alias.sovItemId, matchMethod: "ALIAS", matchScore: 1, candidatesJson: null };
  }

  const sovItems = await prisma.projectSOVItem.findMany({
    where: { sov: { projectId } },
    select: { id: true, description: true },
  });
  const result = matchSovItem(haystack, sovItems, 0.8);
  if (result.kind === "match") {
    return { kind: "sov", li, haystack, amountCents, sovItemId: result.candidate.id, matchMethod: "SCORE", matchScore: result.score, candidatesJson: null };
  }
  const candidatesJson =
    result.kind === "ambiguous"
      ? result.candidates.map((c) => ({ id: c.candidate.id, label: c.candidate.description, score: c.score }))
      : null;
  return { kind: "sov", li, haystack, amountCents, sovItemId: null, matchMethod: null, matchScore: null, candidatesJson };
}

/** Resolves what unit number a janitorial line item's text refers to — alias first, then scoring. */
async function resolveUnitLineItem(ctx: LineItemContext, buildingId: string, knownUnitNumbers: string[]): Promise<UnitResolution> {
  const { li, haystack, amountCents } = ctx;

  if (ctx.existing && SETTLED_STATUSES.has(ctx.existing.status) && ctx.existing.lineItemText === haystack && ctx.existing.amountCents === amountCents) {
    const prior = await prisma.hubSpotInvoiceLineItemMatch.findUnique({ where: { hubspotLineItemId: li.id } });
    return {
      kind: "unit",
      li,
      haystack,
      amountCents,
      unitNumber: prior?.matchedUnitNumber ?? null,
      matchMethod: (prior?.matchMethod as "ALIAS" | "SCORE" | null) ?? null,
      matchScore: prior?.matchScore ?? null,
      candidatesJson: prior?.candidatesJson ?? null,
    };
  }

  const alias = await prisma.hubSpotUnitAlias.findUnique({
    where: { buildingId_hubspotText: { buildingId, hubspotText: haystack } },
  });
  if (alias && alias.active) {
    return { kind: "unit", li, haystack, amountCents, unitNumber: alias.unitNumber, matchMethod: "ALIAS", matchScore: 1, candidatesJson: null };
  }

  const result = matchUnitNumber(haystack, knownUnitNumbers);
  if (result.kind === "match") {
    return { kind: "unit", li, haystack, amountCents, unitNumber: result.candidate, matchMethod: "SCORE", matchScore: 1, candidatesJson: null };
  }
  const candidatesJson = result.kind === "ambiguous" ? result.candidates.map((c) => ({ id: c.candidate, label: c.candidate, score: c.score })) : null;
  return { kind: "unit", li, haystack, amountCents, unitNumber: null, matchMethod: null, matchScore: null, candidatesJson };
}

type ApplyOutcome = {
  status: "AUTO_APPLIED" | "ALIAS_APPLIED" | "PENDING_REVIEW" | "ALREADY_PAID_SKIPPED";
  matchedSovItemId?: string | null;
  matchedUnitNumber?: string | null;
  matchedTurnoverRequestId?: string | null;
};

function statusForMethod(method: "ALIAS" | "SCORE" | null): "AUTO_APPLIED" | "ALIAS_APPLIED" {
  return method === "ALIAS" ? "ALIAS_APPLIED" : "AUTO_APPLIED";
}

async function applySovResolution(r: SovResolution, projectId: string): Promise<ApplyOutcome> {
  if (!r.sovItemId) return { status: "PENDING_REVIEW" };

  const target = await prisma.projectSOVItem.findUnique({ where: { id: r.sovItemId } });
  if (!target) return { status: "PENDING_REVIEW" };

  if (target.billingStatus === "PAID") return { status: "ALREADY_PAID_SKIPPED", matchedSovItemId: target.id };

  // Jumping straight from not-yet-invoiced to paid with no ERP-side BILLED
  // step is itself a signal something's off (wrong project matched, stale
  // ERP data) — don't auto-apply, route to review instead.
  if (target.billingStatus === "NOT_BILLED") return { status: "PENDING_REVIEW", matchedSovItemId: target.id };

  if (!amountReconciles(r.amountCents, target.scheduledValueCents)) {
    return { status: "PENDING_REVIEW", matchedSovItemId: target.id };
  }

  await prisma.projectSOVItem.update({ where: { id: target.id }, data: { billingStatus: "PAID" } });
  // Same side effects the manual billing PATCH route runs after a SOV item
  // billingStatus change — reused, not reimplemented.
  await syncSovPercentDone(projectId);
  await syncProjectBillingFromSOV(projectId);
  return { status: statusForMethod(r.matchMethod), matchedSovItemId: target.id };
}

/** Applies a whole unit's grouped line items together — all-or-nothing,
 * never partial, since TurnoverRequest.billingStatus is a single field with
 * no way to represent "60% paid". */
async function applyUnitGroup(
  buildingId: string,
  unitNumber: string,
  group: UnitResolution[],
): Promise<{ outcome: ApplyOutcome; perLineItem: Map<string, ApplyOutcome> }> {
  const perLineItem = new Map<string, ApplyOutcome>();

  const candidates = await prisma.turnoverRequest.findMany({
    where: { buildingId, unitNumber, billingStatus: "BILLED" },
  });

  if (candidates.length === 0) {
    const outcome: ApplyOutcome = { status: "PENDING_REVIEW", matchedUnitNumber: unitNumber };
    for (const r of group) perLineItem.set(r.li.id, outcome);
    return { outcome, perLineItem };
  }

  const sumCents = group.reduce((s, r) => s + r.amountCents, 0);

  // >1 candidate happens when a recurring contract has multiple unpaid
  // billing periods for the same unit at once — text alone can't tell them
  // apart, so disambiguate by which one the total actually reconciles with.
  const reconciling = candidates.filter((c) => amountReconciles(sumCents, c.approvedPriceCents ?? c.priceCents ?? 0));

  if (reconciling.length !== 1) {
    const outcome: ApplyOutcome = { status: "PENDING_REVIEW", matchedUnitNumber: unitNumber };
    for (const r of group) perLineItem.set(r.li.id, outcome);
    return { outcome, perLineItem };
  }

  const target = reconciling[0]!;
  await prisma.turnoverRequest.update({ where: { id: target.id }, data: { billingStatus: "PAID" } });
  await syncProjectBillingFromRequest(target.id, "PAID");

  for (const r of group) {
    perLineItem.set(r.li.id, {
      status: statusForMethod(r.matchMethod),
      matchedUnitNumber: unitNumber,
      matchedTurnoverRequestId: target.id,
    });
  }
  return { outcome: { status: statusForMethod(group[0]!.matchMethod), matchedUnitNumber: unitNumber, matchedTurnoverRequestId: target.id }, perLineItem };
}

async function upsertLedgerRow(params: {
  invoiceId: string;
  dealId: string | null;
  li: HubSpotLineItemRecord;
  haystack: string;
  amountCents: number;
  projectId: string | null;
  buildingId: string | null;
  matchMethod: "ALIAS" | "SCORE" | null;
  matchScore: number | null;
  candidatesJson: unknown;
  outcome: ApplyOutcome;
}) {
  const data = {
    hubspotInvoiceId: params.invoiceId,
    hubspotDealId: params.dealId,
    lineItemText: params.haystack,
    amountCents: params.amountCents,
    projectId: params.projectId,
    buildingId: params.buildingId,
    matchedSovItemId: params.outcome.matchedSovItemId ?? null,
    matchedUnitNumber: params.outcome.matchedUnitNumber ?? null,
    matchedTurnoverRequestId: params.outcome.matchedTurnoverRequestId ?? null,
    matchMethod: params.matchMethod,
    matchScore: params.matchScore,
    candidatesJson: params.candidatesJson ?? undefined,
    status: params.outcome.status,
  } as const;

  await prisma.hubSpotInvoiceLineItemMatch.upsert({
    where: { hubspotLineItemId: params.li.id },
    create: { hubspotLineItemId: params.li.id, ...data },
    update: data,
  });
}

export async function processPaidInvoices(): Promise<{ processed: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;

  const invoices = await searchPaidInvoices();

  for (const invoice of invoices) {
    try {
      const dealId = await fetchAssociatedDealId(invoice.id);
      if (!dealId) continue;

      const project = await prisma.project.findUnique({ where: { hubspotDealId: dealId }, select: { id: true } });
      const building = project ? null : await prisma.building.findUnique({ where: { hubspotDealId: dealId }, select: { id: true } });
      if (!project && !building) continue; // not one of ours

      const lineItemIds = await listAssociatedLineItemIds(invoice.id);
      const lineItems = await fetchLineItemsByIds(lineItemIds);
      if (lineItems.length === 0) continue;

      const existingRows = await prisma.hubSpotInvoiceLineItemMatch.findMany({
        where: { hubspotLineItemId: { in: lineItems.map((li) => li.id) } },
      });
      const existingByLineItemId = new Map(existingRows.map((r) => [r.hubspotLineItemId, r]));

      const contexts: LineItemContext[] = lineItems.map((li) => {
        const haystack = combinedLineItemText(li.properties.name ?? "", li.properties.description);
        const amountCents = parseAmountCents(li.properties.amount);
        const existing = existingByLineItemId.get(li.id) ?? null;
        return { li, haystack, amountCents, existing };
      });

      if (project) {
        for (const ctx of contexts) {
          const resolution = await resolveSovLineItem(ctx, project.id);
          const outcome = await applySovResolution(resolution, project.id);
          await upsertLedgerRow({
            invoiceId: invoice.id,
            dealId,
            li: ctx.li,
            haystack: ctx.haystack,
            amountCents: ctx.amountCents,
            projectId: project.id,
            buildingId: null,
            matchMethod: resolution.matchMethod,
            matchScore: resolution.matchScore,
            candidatesJson: resolution.candidatesJson,
            outcome,
          });
          processed += 1;
        }
      } else if (building) {
        const knownUnitNumbers = (
          await prisma.turnoverRequest.findMany({
            where: { buildingId: building.id, unitNumber: { not: null } },
            select: { unitNumber: true },
            distinct: ["unitNumber"],
          })
        )
          .map((r) => r.unitNumber)
          .filter((u): u is string => Boolean(u));

        const resolutions: UnitResolution[] = [];
        for (const ctx of contexts) {
          resolutions.push(await resolveUnitLineItem(ctx, building.id, knownUnitNumbers));
        }

        const grouped = new Map<string, UnitResolution[]>();
        const ungrouped: UnitResolution[] = [];
        for (const r of resolutions) {
          if (!r.unitNumber) {
            ungrouped.push(r);
            continue;
          }
          const list = grouped.get(r.unitNumber) ?? [];
          list.push(r);
          grouped.set(r.unitNumber, list);
        }

        for (const r of ungrouped) {
          await upsertLedgerRow({
            invoiceId: invoice.id,
            dealId,
            li: r.li,
            haystack: r.haystack,
            amountCents: r.amountCents,
            projectId: null,
            buildingId: building.id,
            matchMethod: r.matchMethod,
            matchScore: r.matchScore,
            candidatesJson: r.candidatesJson,
            outcome: { status: "PENDING_REVIEW" },
          });
          processed += 1;
        }

        for (const [unitNumber, group] of grouped) {
          const { perLineItem } = await applyUnitGroup(building.id, unitNumber, group);
          for (const r of group) {
            const outcome = perLineItem.get(r.li.id) ?? { status: "PENDING_REVIEW" as const };
            await upsertLedgerRow({
              invoiceId: invoice.id,
              dealId,
              li: r.li,
              haystack: r.haystack,
              amountCents: r.amountCents,
              projectId: null,
              buildingId: building.id,
              matchMethod: r.matchMethod,
              matchScore: r.matchScore,
              candidatesJson: r.candidatesJson,
              outcome,
            });
            processed += 1;
          }
        }
      }
    } catch (e) {
      errors.push(`invoice ${invoice.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { processed, errors };
}
