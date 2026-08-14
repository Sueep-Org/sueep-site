import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  computeChangeOrderLaborEstimate,
  getChangeOrderLaborRates,
  hasCustomChangeOrderLaborRate,
  CHANGE_ORDER_ESTIMATE_DAY_HOURS,
} from "@/lib/changeOrderLaborRates";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function parseCount(value: string | null): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** Public "how much would this change order cost" preview for the project
 * portal — deliberately returns only a total, never the underlying
 * Cleaner/Foreman $/hr (see hasCustomChangeOrderLaborRate). Priced is false,
 * with no total at all, for any project nobody has set a real rate on yet —
 * the internal default rate is never surfaced as if it were a reviewed
 * number. */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const cleanerCount = parseCount(searchParams.get("cleanerCount"));
  const supervisorCount = parseCount(searchParams.get("supervisorCount"));

  // Same eligible-segment check as the sibling SOV/search endpoints.
  const project = await prisma.project.findFirst({
    where: { id, segment: { in: ["COMMERCIAL_PAINTING", "COMMERCIAL_CLEANING", "COMMERCIAL", "OTHER"] } },
    select: { laborRateCard: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!hasCustomChangeOrderLaborRate(project.laborRateCard)) {
    return NextResponse.json({ priced: false });
  }

  if (cleanerCount === 0 && supervisorCount === 0) {
    return NextResponse.json({ priced: true, totalCents: 0 });
  }

  const rates = getChangeOrderLaborRates(project.laborRateCard);
  const estimate = computeChangeOrderLaborEstimate(
    { cleanerCount, supervisorCount, hours: CHANGE_ORDER_ESTIMATE_DAY_HOURS },
    rates,
  );

  return NextResponse.json({ priced: true, totalCents: estimate.totalCents });
}
