import { NextResponse } from "next/server";
import { findSubByToken, sendSignInCode } from "@/lib/erp/subPortalAccess";

type Ctx = { params: Promise<{ token: string }> };

/** Emails the sub a sign-in code. Public: the link token is the only key. */
export async function POST(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const sub = await findSubByToken(token);
  if (!sub) return NextResponse.json({ error: "This link doesn't work anymore. Contact Sueep for a new one." }, { status: 404 });
  const result = await sendSignInCode(sub);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 429 });
  return NextResponse.json({ ok: true });
}
