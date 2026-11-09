import { NextResponse } from "next/server";
import { canSeeFinancials, getErpAuth } from "@/lib/erpAuth";
import { cancelOffer } from "@/lib/erp/subOffers";

type Ctx = { params: Promise<{ id: string }> };

/** Takes back an open offer. Body: { note } (optional) */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { note?: unknown } | null;
  const result = await cancelOffer(id, auth.email, typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
