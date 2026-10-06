import { NextResponse } from "next/server";
import { requireSignedInManager } from "@/lib/erp/propertyManagerAccess";
import { cancelPendingRequest } from "@/lib/erp/propertyManagerChanges";

type Ctx = { params: Promise<{ token: string; id: string }> };

/** Cancels a request staff haven't confirmed yet. */
export async function POST(_req: Request, ctx: Ctx) {
  const { token, id } = await ctx.params;
  const auth = await requireSignedInManager(token);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const result = await cancelPendingRequest(auth.manager, id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
