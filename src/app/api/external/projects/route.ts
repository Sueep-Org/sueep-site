import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasCustomChangeOrderLaborRate } from "@/lib/changeOrderLaborRates";

export const runtime = "nodejs";

// Exclude janitorial, real estate, and change-order-only projects. Includes
// the legacy raw "COMMERCIAL" segment value (see LEGACY_SEGMENT_MAP in
// projectSegments.ts) alongside its normalized form, "COMMERCIAL_CLEANING" —
// this filter runs directly against the stored segment string, so it can't
// go through normalizeProjectSegment() itself.
const ELIGIBLE_SEGMENTS = ["COMMERCIAL_PAINTING", "COMMERCIAL_CLEANING", "COMMERCIAL", "OTHER"];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim();
  if (!search || search.length < 2) return NextResponse.json([]);

  const projects = await prisma.project.findMany({
    where: {
      segment: { in: ELIGIBLE_SEGMENTS },
      status: { in: ["ACTIVE", "ON_HOLD", "UPCOMING"] },
      jobTitle: { contains: search, mode: "insensitive" },
    },
    select: {
      id: true,
      jobTitle: true,
      supervisor: true,
      segment: true,
      laborRateCard: true,
    },
    orderBy: { jobTitle: "asc" },
    take: 20,
  });

  // Strip the raw rate card out of the public response — only whether one's
  // been set, never the actual $/hr numbers (see hasCustomChangeOrderLaborRate).
  const results = projects.map(({ laborRateCard, ...p }) => ({
    ...p,
    hasCustomLaborRate: hasCustomChangeOrderLaborRate(laborRateCard),
  }));

  return NextResponse.json(results);
}
