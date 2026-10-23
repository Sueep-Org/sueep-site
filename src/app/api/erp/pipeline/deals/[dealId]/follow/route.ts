import { NextResponse } from "next/server";
import { getErpAuth, canViewPipelineBoard } from "@/lib/erpAuth";
import { setFollowing } from "@/lib/erp/dealFollowers";

type Ctx = { params: Promise<{ dealId: string }> };

/** PUT { pipeline, follow }: follow a deal (get its changes by email and in the inbox) or stop. */
export async function PUT(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canViewPipelineBoard(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { dealId } = await ctx.params;
  if (!/^\d+$/.test(dealId)) return NextResponse.json({ error: "Unknown deal." }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { pipeline?: unknown; follow?: unknown } | null;
  const pipeline = body?.pipeline === "janitorial" ? "janitorial" : body?.pipeline === "post-con" ? "post-con" : null;
  if (!pipeline) return NextResponse.json({ error: "Unknown pipeline." }, { status: 400 });
  const result = await setFollowing({ dealId, pipeline, userEmail: auth.email, follow: body?.follow === true });
  return "error" in result ? NextResponse.json(result, { status: 400 }) : NextResponse.json(result);
}
