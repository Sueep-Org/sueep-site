import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeTurnoverPricing } from "@/lib/turnoverPricing";
import { TURNOVER_UNIT_LAYOUTS } from "@/lib/turnoverPricingPackages";
import { syncProjectBillingFromRequest } from "@/lib/sovSync";

type Ctx = { params: Promise<{ id: string }> };

const PARTIAL_TURN_LAYOUT_VALUES = TURNOVER_UNIT_LAYOUTS.filter((l) => l !== "common-area");

function parsePartialTurnLayout(value: unknown): string | null {
  const layout = String(value ?? "").trim();
  return (PARTIAL_TURN_LAYOUT_VALUES as readonly string[]).includes(layout) ? layout : null;
}

function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseIntValue(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

const REQUEST_TYPES = ["TURNOVER", "REGULAR"] as const;
const STATUSES = ["PENDING", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "QUALITY_CHECK", "APPROVED"] as const;
const UNIT_QUALITY_VALUES = ["GOOD", "FAIR", "POOR"] as const;

function parseUnitQuality(value: unknown): string | null {
  const quality = String(value ?? "").trim().toUpperCase();
  return (UNIT_QUALITY_VALUES as readonly string[]).includes(quality) ? quality : null;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const request = await prisma.turnoverRequest.findUnique({
    where: { id },
    include: { building: true },
  });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(request);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = await prisma.turnoverRequest.findUnique({ where: { id }, include: { building: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.buildingId !== undefined) {
    const buildingId = String(body.buildingId || "").trim();
    if (!buildingId) {
      return NextResponse.json({ error: "buildingId is required" }, { status: 400 });
    }
    data.buildingId = buildingId;
  }

  if (body.requestType !== undefined) {
    const requestTypeRaw = String(body.requestType || "").toUpperCase();
    if (REQUEST_TYPES.includes(requestTypeRaw as (typeof REQUEST_TYPES)[number])) {
      data.requestType = requestTypeRaw;
    }
  }

  if (body.unitNumber !== undefined) data.unitNumber = String(body.unitNumber || "").trim() || null;
  if (body.bedrooms !== undefined) data.bedrooms = parseIntValue(body.bedrooms) ?? null;
  if (body.bathrooms !== undefined) data.bathrooms = parseIntValue(body.bathrooms) ?? null;
  if (body.isPartialTurn !== undefined) data.isPartialTurn = Boolean(body.isPartialTurn);
  if (body.partialTurnLayout !== undefined) data.partialTurnLayout = parsePartialTurnLayout(body.partialTurnLayout);
  if (body.sqft !== undefined) data.sqft = parseIntValue(body.sqft) ?? null;
  if (body.unitQuality !== undefined) data.unitQuality = parseUnitQuality(body.unitQuality);
  if (body.fullPaint !== undefined) data.fullPaint = Boolean(body.fullPaint);
  if (body.touchUpPaint !== undefined) data.touchUpPaint = parseIntValue(body.touchUpPaint) ?? 0;
  if (body.fullClean !== undefined) data.fullClean = Boolean(body.fullClean);
  if (body.carpetCleaning !== undefined) data.carpetCleaning = Boolean(body.carpetCleaning);
  if (body.materialsAdditional !== undefined) data.materialsAdditional = Boolean(body.materialsAdditional);
  if (body.ceilingPaint !== undefined) data.ceilingPaint = Boolean(body.ceilingPaint);
  if (body.compounding !== undefined) data.compounding = parseIntValue(body.compounding) ?? 0;
  if (body.otherWork !== undefined) data.otherWork = Boolean(body.otherWork);
  if (body.otherDescription !== undefined) data.otherDescription = body.otherDescription ? String(body.otherDescription).trim() || null : null;
  if (body.otherCents !== undefined) data.otherCents = typeof body.otherCents === "number" ? body.otherCents : null;

  if (body.startDate !== undefined) data.startDate = parseDate(body.startDate);
  if (body.endDate !== undefined) data.endDate = parseDate(body.endDate);
  if (body.moveOutDate !== undefined) data.moveOutDate = parseDate(body.moveOutDate);
  if (body.moveInDate !== undefined) data.moveInDate = parseDate(body.moveInDate);
  if (body.createdBy !== undefined) data.createdBy = String(body.createdBy || "").trim() || null;
  if (body.pmSignatureUrl !== undefined) {
    const signature = String(body.pmSignatureUrl || "").trim();
    data.pmSignatureUrl = signature || null;
    data.pmSignedAt = signature ? existing.pmSignedAt ?? new Date() : null;
  }

  // Note: this route no longer stamps completedAt/completedScopeItems on a
  // "COMPLETED" status here — that used to duplicate (and could drift from)
  // the real completion pathway, which is Project.status becoming COMPLETE
  // via PATCH /api/erp/projects/[id] (see becomingComplete there). This
  // route's TurnoverRequest.status is otherwise still used for the
  // ASSIGNED/IN_PROGRESS/QUALITY_CHECK/APPROVED workflow (the latter two
  // set by the quality-checks flow), just not as a second completion signal.
  if (body.status !== undefined) {
    const statusRaw = String(body.status || "").toUpperCase();
    if (STATUSES.includes(statusRaw as (typeof STATUSES)[number])) {
      data.status = statusRaw;
    }
  }

  if (body.billingStatus !== undefined) {
    const VALID_BILLING = ["NOT_BILLED", "BILLED", "PAID"];
    const val = String(body.billingStatus).toUpperCase();
    if (VALID_BILLING.includes(val)) data.billingStatus = val;
  }

  let pricingBuildingName = existing.building.name;
  let pricingPackage: unknown = existing.building.pricingPackage;
  if (typeof data.buildingId === "string" && data.buildingId !== existing.buildingId) {
    const nextBuilding = await prisma.building.findUnique({ where: { id: data.buildingId } });
    if (!nextBuilding) return NextResponse.json({ error: "Building not found" }, { status: 400 });
    pricingBuildingName = nextBuilding.name;
    pricingPackage = nextBuilding.pricingPackage;
  }

  const effectiveBedrooms = body.bedrooms !== undefined ? parseIntValue(body.bedrooms) : existing.bedrooms;
  const effectiveBathrooms = body.bathrooms !== undefined ? parseIntValue(body.bathrooms) : existing.bathrooms;
  const isCommonArea = body.isCommonArea !== undefined
    ? Boolean(body.isCommonArea)
    : (effectiveBedrooms === null && effectiveBathrooms === null);
  const effectiveOtherWork = data.otherWork !== undefined ? Boolean(data.otherWork) : existing.otherWork;
  const effectiveOtherCents = data.otherCents !== undefined ? (data.otherCents as number | null) : existing.otherCents;
  const effectiveIsPartialTurn = data.isPartialTurn !== undefined ? Boolean(data.isPartialTurn) : existing.isPartialTurn;
  const effectivePartialTurnLayout =
    data.partialTurnLayout !== undefined ? (data.partialTurnLayout as string | null) : existing.partialTurnLayout;

  const pricingInput = {
    requestType: (data.requestType as "TURNOVER" | "REGULAR") ?? existing.requestType,
    buildingName: pricingBuildingName,
    pricingPackage,
    bedrooms: effectiveBedrooms,
    bathrooms: effectiveBathrooms,
    isCommonArea,
    fullPaint: data.fullPaint !== undefined ? Boolean(data.fullPaint) : existing.fullPaint,
    touchUpPaint:
      body.touchUpPaint !== undefined ? parseIntValue(body.touchUpPaint) ?? 0 : existing.touchUpPaint ?? 0,
    fullClean: data.fullClean !== undefined ? Boolean(data.fullClean) : existing.fullClean,
    carpetCleaning: data.carpetCleaning !== undefined ? Boolean(data.carpetCleaning) : existing.carpetCleaning,
    materialsAdditional:
      data.materialsAdditional !== undefined ? Boolean(data.materialsAdditional) : existing.materialsAdditional,
    ceilingPaint: data.ceilingPaint !== undefined ? Boolean(data.ceilingPaint) : existing.ceilingPaint,
    compounding:
      body.compounding !== undefined ? parseIntValue(body.compounding) ?? 0 : existing.compounding ?? 0,
    isPartialTurn: effectiveIsPartialTurn,
    partialTurnLayout: effectivePartialTurnLayout,
  };

  const pricing = computeTurnoverPricing(pricingInput);
  const otherAddOn = effectiveOtherWork ? (effectiveOtherCents ?? 0) : 0;
  data.priceCents = (pricing.priceCents + otherAddOn) || null;
  if (body.pmSignatureUrl !== undefined && data.pmSignatureUrl) {
    data.approvedPriceCents = pricing.priceCents || null;
  }

  try {
    const request = await prisma.turnoverRequest.update({ where: { id }, data: data as object });

    // Keep the linked project's contractValueCents mirroring whatever billing
    // actually uses (approvedPriceCents override if one is set, else the
    // freshly computed priceCents), so Financials/dashboards never silently
    // disagree with the real billed price. A manual override left in
    // approvedPriceCents survives this untouched, since it only changes here
    // when this same PATCH just set it (pmSignatureUrl branch above).
    const effectiveApprovedPriceCents =
      data.approvedPriceCents !== undefined ? (data.approvedPriceCents as number | null) : existing.approvedPriceCents;
    await prisma.project.updateMany({
      where: { turnoverRequestId: id },
      data: { contractValueCents: effectiveApprovedPriceCents ?? request.priceCents },
    });

    if (data.billingStatus) {
      await syncProjectBillingFromRequest(id, String(data.billingStatus));
    }

    return NextResponse.json(request);
  } catch (e) {
    console.error("PATCH /api/erp/turnover-requests/[id]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await prisma.turnoverRequest.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/erp/turnover-requests/[id]", e);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
