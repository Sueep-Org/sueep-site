import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { canSeeProposals } from "@/lib/erp/subBids";

type Ctx = { params: Promise<{ id: string }> };

/** Link past bids (logged with no profile) to this contractor. Bids already on a profile are left alone. */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeProposals(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const contractor = await prisma.contractor.findUnique({ where: { id }, select: { id: true } });
  if (!contractor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { bidIds?: unknown } | null;
  const bidIds = Array.isArray(body?.bidIds) ? [...new Set(body.bidIds.map((v) => String(v)).filter(Boolean))] : [];
  if (bidIds.length === 0) return NextResponse.json({ error: "Pick at least one bid" }, { status: 400 });

  const { count } = await prisma.subBid.updateMany({ where: { id: { in: bidIds }, contractorId: null }, data: { contractorId: id } });
  return NextResponse.json({ linked: count });
}
