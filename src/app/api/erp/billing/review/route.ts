import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const rows = await prisma.hubSpotInvoiceLineItemMatch.findMany({
    where: { status: "PENDING_REVIEW" },
    orderBy: { createdAt: "asc" },
    include: {
      project: { select: { id: true, jobTitle: true } },
      building: { select: { id: true, name: true } },
    },
  });

  const results = await Promise.all(
    rows.map(async (row) => {
      if (row.projectId) {
        const candidateSovItems = await prisma.projectSOVItem.findMany({
          where: { sov: { projectId: row.projectId } },
          select: { id: true, description: true, scheduledValueCents: true, billingStatus: true },
        });
        return { ...row, candidateSovItems, candidateUnits: [] as never[] };
      }
      if (row.buildingId) {
        const candidateUnits = await prisma.turnoverRequest.findMany({
          where: { buildingId: row.buildingId, billingStatus: "BILLED" },
          select: { id: true, unitNumber: true, priceCents: true, approvedPriceCents: true },
        });
        return { ...row, candidateSovItems: [] as never[], candidateUnits };
      }
      return { ...row, candidateSovItems: [] as never[], candidateUnits: [] as never[] };
    }),
  );

  return NextResponse.json({ rows: results });
}
