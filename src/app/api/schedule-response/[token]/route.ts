import { NextResponse } from "next/server";
import { recordResponse } from "@/lib/erp/scheduleConfirmations";

type Ctx = { params: Promise<{ token: string }> };

/** Public (no login): the link's token is the key. Records Confirm or Can't make it for one scheduled day. */
export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!/^[a-f0-9]{48}$/.test(token)) return NextResponse.json({ error: "This link isn't valid anymore." }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { answer?: unknown; reason?: unknown } | null;
  const answer = body?.answer === "CONFIRMED" ? "CONFIRMED" : body?.answer === "DECLINED" ? "DECLINED" : null;
  if (!answer) return NextResponse.json({ error: "Pick Confirm or Can't make it." }, { status: 400 });
  const result = await recordResponse(token, answer, typeof body?.reason === "string" ? body.reason : null);
  return "error" in result ? NextResponse.json(result, { status: 400 }) : NextResponse.json(result);
}
