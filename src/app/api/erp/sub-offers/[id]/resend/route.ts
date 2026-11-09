import { NextResponse } from "next/server";
import { canSeeFinancials, getErpAuth } from "@/lib/erpAuth";
import { offerPayFromBody, resendOffer } from "@/lib/erp/subOffers";

type Ctx = { params: Promise<{ id: string }> };

/** Sends a declined or expired offer again, usually at a new price. Body: { payCents, note, answerBy } */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const payCents = offerPayFromBody(body?.payCents);
  if (payCents === undefined) return NextResponse.json({ error: "Pay isn't a valid amount" }, { status: 400 });
  const result = await resendOffer(id, {
    payCents,
    note: typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 1000) : null,
    answerBy: new Date(String(body?.answerBy ?? "")),
    sentBy: auth.email,
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result, { status: 201 });
}
