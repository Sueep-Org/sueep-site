import { NextResponse } from "next/server";
import { requireSignedInManager } from "@/lib/erp/propertyManagerAccess";
import { moveRequestDate } from "@/lib/erp/propertyManagerChanges";

type Ctx = { params: Promise<{ token: string; id: string }> };

/** Changes the preferred date on a request staff haven't confirmed yet. Body: { requestedStartDate }. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { token, id } = await ctx.params;
  const auth = await requireSignedInManager(token);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const result = await moveRequestDate(auth.manager, id, body);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
