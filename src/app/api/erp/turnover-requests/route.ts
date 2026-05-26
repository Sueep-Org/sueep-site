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
  const fullPaint = Boolean(body.fullPaint);
  const touchUpPaint = parseIntValue(body.touchUpPaint) ?? 0;
  const fullClean = Boolean(body.fullClean);
  const carpetCleaning = Boolean(body.carpetCleaning);
  const materialsAdditional = Boolean(body.materialsAdditional);
  const startDate = parseDate(body.startDate);
  const endDate = parseDate(body.endDate);
  const createdBy = body.createdBy != null ? String(body.createdBy).trim() : null;
  const sueepPmName = stringValue(body.sueepPmName);
  const sueepPmEmail = stringValue(body.sueepPmEmail);

  const pricing = computeTurnoverPricing({
    requestType,
    bedrooms,
    bathrooms,
    fullPaint,
    touchUpPaint,
    fullClean,
    carpetCleaning,
    materialsAdditional,
  });

  try {
    const request = await prisma.turnoverRequest.create({
      data: {
        buildingId,
        requestType,
        unitNumber: unitNumber || null,
        bedrooms: bedrooms ?? null,
        bathrooms: bathrooms ?? null,
        fullPaint,
        touchUpPaint,
        fullClean,
        carpetCleaning,
        materialsAdditional,
        startDate,
        endDate,
        priceCents: pricing.priceCents || null,
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
      services: pricing.services,
      startDate: startDate ? startDate.toISOString().split("T")[0] : null,
      endDate: endDate ? endDate.toISOString().split("T")[0] : null,
      priceLabel: pricing.priceLabel,
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
