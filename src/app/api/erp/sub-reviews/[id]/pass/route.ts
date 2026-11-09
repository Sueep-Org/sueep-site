import { NextResponse } from "next/server";
import { getErpAuth } from "@/lib/erpAuth";
import { passReview } from "@/lib/erp/subReviews";

type Ctx = { params: Promise<{ id: string }> };

/** Passes a sub's day. Body: { note?, onSite? } */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { note?: unknown; onSite?: unknown } | null;
  const result = await passReview(id, auth, { note: typeof body?.note === "string" ? body.note : null, onSite: body?.onSite === true });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
