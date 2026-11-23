import { NextResponse } from "next/server";
import { findSubByToken, sendSignInCode } from "@/lib/erp/subPortalAccess";

type Ctx = { params: Promise<{ token: string }> };

/** Emails the sub a sign-in code, or an Admin/PM/Business Manager when the body has staffUserId. Public: the link token is the only key. */
export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const sub = await findSubByToken(token);
  if (!sub) return NextResponse.json({ error: "This link doesn't work anymore. Contact Sueep for a new one." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { staffUserId?: unknown };
  const staffUserId = typeof body.staffUserId === "string" && body.staffUserId ? body.staffUserId : null;
  const result = await sendSignInCode(sub, staffUserId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 429 });
  return NextResponse.json({ ok: true, sentTo: result.sentTo });
}
