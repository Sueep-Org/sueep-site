import { NextResponse } from "next/server";
import { requireSignedInSub } from "@/lib/erp/subPortalAccess";
import { sendFixes } from "@/lib/erp/subReviews";

type Ctx = { params: Promise<{ token: string; id: string }> };

/** The sub sends their fix photos back for review. */
export async function POST(_req: Request, ctx: Ctx) {
  const { token, id } = await ctx.params;
  const access = await requireSignedInSub(token);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const result = await sendFixes(access.sub, id);
  if ("error" in result) return NextResponse.json(result, { status: result.code === "NOT_FOUND" ? 404 : 409 });
  return NextResponse.json(result);
}
