import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeTurnoverPricing } from "@/lib/turnoverPricing";

type Ctx = { params: Promise<{ id: string }> };

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
  if (body.fullPaint !== undefined) data.fullPaint = Boolean(body.fullPaint);
  if (body.touchUpPaint !== undefined) data.touchUpPaint = parseIntValue(body.touchUpPaint) ?? 0;
  if (body.fullClean !== undefined) data.fullClean = Boolean(body.fullClean);
  if (body.carpetCleaning !== undefined) data.carpetCleaning = Boolean(body.carpetCleaning);
  if (body.materialsAdditional !== undefined) data.materialsAdditional = Boolean(body.materialsAdditional);

  if (body.startDate !== undefined) data.startDate = parseDate(body.startDate);
  if (body.endDate !== undefined) data.endDate = parseDate(body.endDate);
  if (body.createdBy !== undefined) data.createdBy = String(body.createdBy || "").trim() || null;

  if (body.status !== undefined) {
    const statusRaw = String(body.status || "").toUpperCase();
    if (STATUSES.includes(statusRaw as (typeof STATUSES)[number])) {
      data.status = statusRaw;
      if (statusRaw === "COMPLETED" && existing.completedAt == null) {
        data.completedAt = new Date();
      }
    }
  }

  let pricingBuildingName = existing.building.name;
  if (typeof data.buildingId === "string" && data.buildingId !== existing.buildingId) {
    const nextBuilding = await prisma.building.findUnique({ where: { id: data.buildingId } });
    if (!nextBuilding) return NextResponse.json({ error: "Building not found" }, { status: 400 });
    pricingBuildingName = nextBuilding.name;
  }

  const pricingInput = {
    requestType: (data.requestType as "TURNOVER" | "REGULAR") ?? existing.requestType,
    buildingName: pricingBuildingName,
    bedrooms: body.bedrooms !== undefined ? parseIntValue(body.bedrooms) : existing.bedrooms,
    bathrooms: body.bathrooms !== undefined ? parseIntValue(body.bathrooms) : existing.bathrooms,
    fullPaint: data.fullPaint !== undefined ? Boolean(data.fullPaint) : existing.fullPaint,
    touchUpPaint:
      body.touchUpPaint !== undefined ? parseIntValue(body.touchUpPaint) ?? 0 : existing.touchUpPaint ?? 0,
    fullClean: data.fullClean !== undefined ? Boolean(data.fullClean) : existing.fullClean,
    carpetCleaning: data.carpetCleaning !== undefined ? Boolean(data.carpetCleaning) : existing.carpetCleaning,
    materialsAdditional:
      data.materialsAdditional !== undefined ? Boolean(data.materialsAdditional) : existing.materialsAdditional,
  };

  const pricing = computeTurnoverPricing(pricingInput);
  data.priceCents = pricing.priceCents || null;

  try {
    const request = await prisma.turnoverRequest.update({ where: { id }, data: data as object });
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
