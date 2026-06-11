import { prisma } from "@/lib/prisma";
import { computeTurnoverPricing } from "@/lib/turnoverPricing";
import {
  sanitizeTurnoverPricingPackage,
  type TurnoverPricingPackage,
} from "@/lib/turnoverPricingPackages";

type UnitScopePayload = {
  unitNumber?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  paintDate?: unknown;
  cleanDate?: unknown;
  moveOutDate?: unknown;
  features?: unknown;
  fullPaint?: unknown;
  touchUpPaint?: unknown;
  materialsAdditional?: unknown;
  fullClean?: unknown;
  carpetCleaning?: unknown;
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function dateValue(value: unknown) {
  const raw = stringValue(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function featureToBedsBaths(value: unknown) {
  const feature = stringValue(value);
  if (feature === "studio") return { bedrooms: 0, bathrooms: 1 };
  if (feature === "common-area") return { bedrooms: null, bathrooms: null };
  const match = feature.match(/^(\d+)\/(\d+)$/);
  if (!match) return { bedrooms: 1, bathrooms: 1 };
  return {
    bedrooms: Number(match[1]),
    bathrooms: Number(match[2]),
  };
}

function parseUnitScopes(value: unknown): UnitScopePayload[] {
  if (!Array.isArray(value)) return [{}];
  const units = value.filter((unit): unit is UnitScopePayload => Boolean(unit) && typeof unit === "object");
  return units.length ? units : [{}];
}

function readDollar(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function pricingPackageFromPayload(body: Record<string, unknown>, fallback: unknown): TurnoverPricingPackage {
  const base = sanitizeTurnoverPricingPackage(fallback);
  const pricing = body.pricing && typeof body.pricing === "object" ? (body.pricing as Record<string, unknown>) : {};
  const dollars =
    pricing.pricePackageDollars && typeof pricing.pricePackageDollars === "object"
      ? (pricing.pricePackageDollars as Record<string, unknown>)
      : {};
  const clean = readDollar(dollars.fullClean);
  const paint = readDollar(dollars.fullPaint);

  if (clean == null && paint == null) return base;

  return sanitizeTurnoverPricingPackage({
    ...base,
    label: stringValue(pricing.packageLabel) || base.label,
    cleaningLayoutRates: Object.fromEntries(
      Object.keys(base.cleaningLayoutRates ?? {}).map((layout) => [layout, clean ?? base.cleaningLayoutRates?.[layout as keyof typeof base.cleaningLayoutRates]])
    ),
    paintingLayoutRates: Object.fromEntries(
      Object.keys(base.paintingLayoutRates ?? {}).map((layout) => [layout, paint ?? base.paintingLayoutRates?.[layout as keyof typeof base.paintingLayoutRates]])
    ),
  });
}

async function resolveBuilding(body: Record<string, unknown>) {
  const requestedId = stringValue(body.buildingId);
  if (requestedId) {
    const existing = await prisma.building.findUnique({ where: { id: requestedId } });
    if (existing) return existing;
  }

  const name = stringValue(body.buildingName);
  const address = stringValue(body.buildingAddress);
  if (!name) {
    throw new Error("Building name is required for turnover requests");
  }

  const buildings = await prisma.building.findMany({ where: { name: { equals: name, mode: "insensitive" } } });
  const existing =
    buildings.find((building) => normalizeName(building.address) === normalizeName(address)) ?? buildings[0];

  if (existing) {
    const pricingPackage = pricingPackageFromPayload(body, existing.pricingPackage);
    return prisma.building.update({
      where: { id: existing.id },
      data: {
        address: address || existing.address,
        pmName: stringValue(body.pmName) || existing.pmName,
        pmEmail: stringValue(body.pmEmail) || existing.pmEmail,
        pmPhone: stringValue(body.pmPhone) || existing.pmPhone,
        pricingPackage,
      },
    });
  }

  return prisma.building.create({
    data: {
      name,
      address: address || "Address TBD",
      pmName: stringValue(body.pmName) || null,
      pmEmail: stringValue(body.pmEmail) || null,
      pmPhone: stringValue(body.pmPhone) || null,
      pricingPackage: pricingPackageFromPayload(body, null),
    },
  });
}

function unitDateRange(unit: UnitScopePayload) {
  const dates = [unit.startDate, unit.endDate, unit.moveOutDate, unit.paintDate, unit.cleanDate]
    .map(dateValue)
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => a.getTime() - b.getTime());

  return {
    startDate: dateValue(unit.startDate) ?? dates[0] ?? null,
    endDate: dateValue(unit.endDate) ?? dates[dates.length - 1] ?? null,
  };
}

export async function createTurnoverRequestsFromPayload(body: Record<string, unknown>) {
  const building = await resolveBuilding(body);
  const units = parseUnitScopes(body.unitScopes);
  const pricingPackage = pricingPackageFromPayload(body, building.pricingPackage);

  const requests = await Promise.all(
    units.map((unit, index) => {
      const { bedrooms, bathrooms } = featureToBedsBaths(unit.features);
      const { startDate, endDate } = unitDateRange(unit);
      const fullPaint = Boolean(unit.fullPaint);
      const touchUpPaint = Boolean(unit.touchUpPaint) && !fullPaint ? 1 : 0;
      const fullClean = Boolean(unit.fullClean);
      const carpetCleaning = Boolean(unit.carpetCleaning);
      const materialsAdditional = Boolean(unit.materialsAdditional);
      const pricing = computeTurnoverPricing({
        requestType: "TURNOVER",
        buildingName: building.name,
        pricingPackage,
        bedrooms,
        bathrooms,
        fullPaint,
        touchUpPaint,
        fullClean,
        carpetCleaning,
        materialsAdditional,
      });

      return prisma.turnoverRequest.create({
        data: {
          buildingId: building.id,
          requestType: "TURNOVER",
          unitNumber: stringValue(unit.unitNumber) || (unit.features === "common-area" ? "Common Area" : `Unit ${index + 1}`),
          bedrooms,
          bathrooms,
          fullPaint,
          touchUpPaint,
          fullClean,
          carpetCleaning,
          materialsAdditional,
          startDate,
          endDate,
          priceCents: pricing.priceCents || null,
          createdBy: stringValue(body.sueepPmEmail) || stringValue(body.pmEmail) || null,
        },
      });
    })
  );

  return { building, requests };
}
