import { NextResponse } from "next/server";
import { findManagerByToken, signOutDevice } from "@/lib/erp/propertyManagerAccess";

type Ctx = { params: Promise<{ token: string }> };

/** Forgets this browser, so the next visit asks for a code again. */
export async function POST(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const manager = await findManagerByToken(token);
  if (manager) await signOutDevice(manager.id);
  return NextResponse.json({ ok: true });
}
