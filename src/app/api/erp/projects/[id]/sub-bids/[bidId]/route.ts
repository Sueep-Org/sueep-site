import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { canSeeProposals, parseSubBidBody } from "@/lib/erp/subBids";
import { serializeSubBid, subBidInclude, checkSubBidRefs } from "@/lib/erp/subBidRows";

type Ctx = { params: Promise<{ id: string; bidId: string }> };

/** Edit a bid. Only the fields sent change. */
export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeProposals(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, bidId } = await ctx.params;
  const existing = await prisma.subBid.findFirst({ where: { id: bidId, projectId: id }, select: { contractorId: true, bidderName: true, bidderCompany: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const parsed = parseSubBidBody(body, true);
  if ("error" in parsed) return NextResponse.json(parsed, { status: 400 });
  const { sovItemIds, ...data } = parsed.data;

  const merged = { ...existing, ...data };
  if (!merged.contractorId && !merged.bidderName && !merged.bidderCompany) {
    return NextResponse.json({ error: "Pick a contractor or type the sub's name or company" }, { status: 400 });
  }
  const refError = await checkSubBidRefs(id, data.contractorId, sovItemIds ?? []);
  if (refError) return NextResponse.json({ error: refError }, { status: 400 });

  const bid = await prisma.subBid.update({
    where: { id: bidId },
    data: {
      ...data,
      sovItems: sovItemIds ? { set: sovItemIds.map((sid) => ({ id: sid })) } : undefined,
    },
    include: subBidInclude,
  });
  return NextResponse.json(serializeSubBid(bid));
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeProposals(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, bidId } = await ctx.params;
  const { count } = await prisma.subBid.deleteMany({ where: { id: bidId, projectId: id } });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
