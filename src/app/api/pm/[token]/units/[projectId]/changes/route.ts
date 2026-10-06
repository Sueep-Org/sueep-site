import { NextResponse } from "next/server";
import { requireSignedInManager } from "@/lib/erp/propertyManagerAccess";
import { askForChange } from "@/lib/erp/propertyManagerChanges";

type Ctx = { params: Promise<{ token: string; projectId: string }> };

/** Asks staff to cancel or move a confirmed turnover. Body: { kind: CANCEL | RESCHEDULE, newStartDate?, reason? }. */
export async function POST(req: Request, ctx: Ctx) {
  const { token, projectId } = await ctx.params;
  const auth = await requireSignedInManager(token);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const result = await askForChange(auth.manager, projectId, body);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
