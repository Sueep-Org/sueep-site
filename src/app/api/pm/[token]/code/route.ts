import { NextResponse } from "next/server";
import { findManagerByToken, sendSignInCode } from "@/lib/erp/propertyManagerAccess";

type Ctx = { params: Promise<{ token: string }> };

/** Emails the property manager a sign-in code. Public: the link token is the only key. */
export async function POST(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const manager = await findManagerByToken(token);
  if (!manager) return NextResponse.json({ error: "This link doesn't work anymore. Contact Sueep for a new one." }, { status: 404 });
  const result = await sendSignInCode(manager);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 429 });
  return NextResponse.json({ ok: true });
}
