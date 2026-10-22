import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { canSeeProposals } from "@/lib/erp/subBids";
import { isValidScore } from "@/lib/erp/subScores";

type Ctx = { params: Promise<{ id: string }> };

/** Set the sub's pricing score by hand (1-5), or clear it (null) to go back to the one from their bids. */
export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeProposals(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { override?: unknown; note?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  if (body.override !== null && !isValidScore(body.override)) return NextResponse.json({ error: "Pick 1 to 5" }, { status: 400 });

  const clearing = body.override === null;
  const updated = await prisma.contractor.updateMany({
    where: { id },
    data: {
      pricingScoreOverride: clearing ? null : (body.override as number),
      pricingScoreOverrideNote: clearing ? null : typeof body.note === "string" ? body.note.trim() || null : null,
      pricingScoreOverrideBy: clearing ? null : auth.email,
      pricingScoreOverrideAt: clearing ? null : new Date(),
    },
  });
  if (updated.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
