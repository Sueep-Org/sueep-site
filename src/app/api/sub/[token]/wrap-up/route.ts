import { NextResponse } from "next/server";
import { requireSignedInSub } from "@/lib/erp/subPortalAccess";
import { submitWrapUp } from "@/lib/erp/subWrapUps";

type Ctx = { params: Promise<{ token: string }> };

/**
 * End-of-day wrap-up from the portal (subWrapUps.ts).
 * Body: { jobKey, dateKey, answers: [{ done, reason? }] in task order, note? }
 */
export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const access = await requireSignedInSub(token);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request", code: "INVALID" }, { status: 400 });
  const result = await submitWrapUp(access.sub, { jobKey: body.jobKey, dateKey: body.dateKey, answers: body.answers, note: body.note });
  if ("error" in result) {
    const status = result.code === "ALREADY_SENT" ? 409 : result.code === "NOT_YOURS" ? 403 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
