import { NextResponse } from "next/server";
import { getErpAuth } from "@/lib/erpAuth";
import { revalidateTag } from "next/cache";
import { passReview } from "@/lib/erp/subReviews";
import { SUB_SCORES_TAG } from "@/lib/erp/subBidStats";
import { RATING_KEYS, isValidScore } from "@/lib/erp/subScores";

type Ctx = { params: Promise<{ id: string }> };

/** Passes a sub's day and rates them. Body: { quality, reliability, communication (1-5), note?, onSite? } */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const rating = body && RATING_KEYS.every((k) => isValidScore(body[k])) ? { quality: body.quality as number, reliability: body.reliability as number, communication: body.communication as number } : null;
  const result = await passReview(id, auth, { note: typeof body?.note === "string" ? body.note : null, onSite: body?.onSite === true, rating });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  revalidateTag(SUB_SCORES_TAG);
  return NextResponse.json(result);
}
