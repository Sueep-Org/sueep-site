import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeTurnoverPricing } from "@/lib/turnoverPricing";
import { buildTurnoverRequestEmailHtml, sendEmail } from "@/lib/email";

type RequestBody = Record<string, unknown>;

const REQUEST_TYPES = ["TURNOVER", "REGULAR"] as const;

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

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET() {
  const requests = await prisma.turnoverRequest.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: { building: true },
  });
  return NextResponse.json(requests);
}

export async function POST(req: Request) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const buildingId = String(body.buildingId || "").trim();
  if (!buildingId) {
    return NextResponse.json({ error: "buildingId is required" }, { status: 400 });
  }

  const building = await prisma.building.findUnique({ where: { id: buildingId } });
  if (!building) {
    return NextResponse.json({ error: "Building not found" }, { status: 400 });
  }

  const requestTypeRaw = String(body.requestType || "TURNOVER").toUpperCase();
  const requestType = REQUEST_TYPES.includes(requestTypeRaw as (typeof REQUEST_TYPES)[number])
    ? (requestTypeRaw as (typeof REQUEST_TYPES)[number])
    : "TURNOVER";

  const unitNumber = body.unitNumber != null ? String(body.unitNumber).trim() : null;
  const bedrooms = parseIntValue(body.bedrooms);
  const bathrooms = parseIntValue(body.bathrooms);
  const isCommonArea = Boolean(body.isCommonArea) || (bedrooms === null && bathrooms === null && body.isCommonArea !== false);
  const fullPaint = Boolean(body.fullPaint);
  const touchUpPaint = parseIntValue(body.touchUpPaint) ?? 0;
  const fullClean = Boolean(body.fullClean);
  const carpetCleaning = Boolean(body.carpetCleaning);
  const materialsAdditional = Boolean(body.materialsAdditional);
  const ceilingPaint = Boolean(body.ceilingPaint);
  const otherWork = Boolean(body.otherWork);
  const otherDescription = otherWork && body.otherDescription ? String(body.otherDescription).trim() : null;
  const otherCentsRaw = otherWork ? parseIntValue(body.otherCents) : null;
  const otherCents = otherCentsRaw ?? (otherWork && body.otherPrice ? Math.round((Number(String(body.otherPrice).replace(/[$,\s]/g, "")) || 0) * 100) : 0);
  const startDate = parseDate(body.startDate);
  const endDate = parseDate(body.endDate);
  const createdBy = body.createdBy != null ? String(body.createdBy).trim() : null;
  const sueepPmName = stringValue(body.sueepPmName);
  const sueepPmEmail = stringValue(body.sueepPmEmail);

  const basePricing = computeTurnoverPricing({
    requestType,
    buildingName: building.name,
    pricingPackage: building.pricingPackage,
    bedrooms,
    bathrooms,
    isCommonArea,
    fullPaint,
    touchUpPaint,
    fullClean,
    carpetCleaning,
    materialsAdditional,
    ceilingPaint,
  });
  const totalPriceCents = basePricing.priceCents + (otherWork ? otherCents : 0);

  try {
    const request = await prisma.turnoverRequest.create({
      data: {
        buildingId,
        requestType,
        unitNumber: unitNumber || null,
        bedrooms: isCommonArea ? null : (bedrooms ?? null),
        bathrooms: isCommonArea ? null : (bathrooms ?? null),
        fullPaint,
        touchUpPaint,
        fullClean,
        carpetCleaning,
        materialsAdditional,
        ceilingPaint,
        otherWork,
        otherDescription,
        otherCents: otherWork ? otherCents : null,
        startDate,
        endDate,
        priceCents: totalPriceCents || null,
        approvedPriceCents: null,
        createdBy: createdBy || null,
      },
    });

    const recipient = building.pmEmail?.trim() || process.env.CONTACT_TO_EMAIL || "contact@sueep.com";
    const emailHtml = buildTurnoverRequestEmailHtml({
      buildingName: building.name,
      unitNumber,
      requestType,
      bedrooms,
      bathrooms,
      services: basePricing.services,
      startDate: startDate ? startDate.toISOString().split("T")[0] : null,
      endDate: endDate ? endDate.toISOString().split("T")[0] : null,
      priceLabel: basePricing.priceLabel,
      createdBy,
      sueepPmName,
    });

    const recipients = Array.from(new Set([recipient, sueepPmEmail].filter((to): to is string => Boolean(to))));
    await Promise.all(recipients.map((to) => sendEmail({
      to,
      subject: `New Turnover Request Created — ${building.name}`,
      html: emailHtml,
      replyTo: createdBy || undefined,
    })));

    return NextResponse.json(request);
  } catch (e) {
    console.error("POST /api/erp/turnover-requests", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
