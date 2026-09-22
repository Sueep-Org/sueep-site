import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * PATCH /api/franchise-inquiries/[id]
 * Public intake from /franchise, step 2 of 2. Fills in the rest of the form
 * (market, background, goals, etc.) on top of the Contact Information row
 * POST /api/franchise-inquiries already created. Public/unauthenticated, same
 * as the create endpoint, only reachable if the caller already has the id
 * that create returned. Only ever adds fields, never touches name/email/
 * phone/cityState.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as Record<string, unknown>;

    const market = String(body.market || "").trim();
    const marketPreference = String(body.marketPreference || "").trim();
    const launchTimeline = String(body.launchTimeline || "").trim();
    const currentOccupation = String(body.currentOccupation || "").trim();
    const ownsBusiness = String(body.ownsBusiness || "").trim();
    const previousFranchise = String(body.previousFranchise || "").trim();
    const experienceAreas = Array.isArray(body.experienceAreas) ? body.experienceAreas.map((v) => String(v)) : [];
    const backgroundText = String(body.backgroundText || "").trim();
    const interests = Array.isArray(body.interests) ? body.interests.map((v) => String(v)) : [];
    const involvement = String(body.involvement || "").trim();
    const goalsText = String(body.goalsText || "").trim();
    const additionalInfo = String(body.additionalInfo || "").trim();

    const isValid =
      market &&
      marketPreference &&
      launchTimeline &&
      currentOccupation &&
      ownsBusiness &&
      previousFranchise &&
      interests.length > 0 &&
      involvement;

    if (!isValid) {
      return NextResponse.json(
        { error: "Market, timeline, background, at least one interest, and involvement are required" },
        { status: 400 }
      );
    }

    const existing = await prisma.franchiseInquiry.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const responses: Record<string, unknown> = {
      marketPreference,
      launchTimeline,
      currentOccupation,
      ownsBusiness,
      previousFranchise,
      ...(experienceAreas.length > 0 ? { experienceAreas } : {}),
      ...(backgroundText ? { backgroundText } : {}),
      interests,
      involvement,
      ...(goalsText ? { goalsText } : {}),
      ...(additionalInfo ? { additionalInfo } : {}),
    };

    const row = await prisma.franchiseInquiry.update({
      where: { id },
      data: { market, responses: responses as Prisma.InputJsonValue },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: row.id });
  } catch (e) {
    console.error("/api/franchise-inquiries/[id] error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
