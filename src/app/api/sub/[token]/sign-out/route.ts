import { NextResponse } from "next/server";
import { findSubByToken, signOutDevice } from "@/lib/erp/subPortalAccess";

type Ctx = { params: Promise<{ token: string }> };

/** Forgets this browser, so the next visit asks for a code again. */
export async function POST(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const sub = await findSubByToken(token);
  if (sub) await signOutDevice(sub.id);
  return NextResponse.json({ ok: true });
}
