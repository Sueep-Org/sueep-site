import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { canSeeProposals } from "@/lib/erp/subBids";

type Ctx = { params: Promise<{ id: string; ratingId: string }> };

/** Delete a rating. Only whoever gave it, or an Admin. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeProposals(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, ratingId } = await ctx.params;
  const rating = await prisma.contractorRating.findFirst({ where: { id: ratingId, contractorId: id }, select: { ratedBy: true } });
  if (!rating) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (auth.role !== "ADMIN" && rating.ratedBy.toLowerCase() !== auth.email.toLowerCase()) {
    return NextResponse.json({ error: "Only who rated, or an Admin, can delete this" }, { status: 403 });
  }
  await prisma.contractorRating.delete({ where: { id: ratingId } });
  return NextResponse.json({ ok: true });
}
