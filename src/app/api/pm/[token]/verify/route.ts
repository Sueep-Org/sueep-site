import { NextResponse } from "next/server";
import { findManagerByToken, verifySignInCode } from "@/lib/erp/propertyManagerAccess";

type Ctx = { params: Promise<{ token: string }> };

/** Checks the emailed code. Body: { code }. Sets the device cookie when it's right. */
export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const manager = await findManagerByToken(token);
  if (!manager) return NextResponse.json({ error: "This link doesn't work anymore. Contact Sueep for a new one." }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  if (typeof body?.code !== "string" || !body.code.trim()) return NextResponse.json({ error: "Enter the code" }, { status: 400 });
  const result = await verifySignInCode(manager, body.code);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
