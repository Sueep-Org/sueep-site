import { NextResponse } from "next/server";
import { getErpAuth, canViewPipelineBoard } from "@/lib/erpAuth";
import { moveDealStage } from "@/lib/erp/dealStageMove";

type Ctx = { params: Promise<{ dealId: string }> };

/** Move an open deal to another stage (drag, Move to, or Undo). Writes to HubSpot. */
export async function PUT(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canViewPipelineBoard(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { dealId } = await ctx.params;
  if (!/^\d+$/.test(dealId)) return NextResponse.json({ error: "Unknown deal." }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { pipeline?: unknown; fromStageId?: unknown; toStageId?: unknown; confirmWon?: unknown } | null;
  const pipeline = body?.pipeline === "janitorial" ? "janitorial" : body?.pipeline === "post-con" ? "post-con" : null;
  if (!pipeline) return NextResponse.json({ error: "Unknown pipeline." }, { status: 400 });
  if (typeof body?.fromStageId !== "string" || typeof body?.toStageId !== "string") return NextResponse.json({ error: "Unknown stage." }, { status: 400 });
  const result = await moveDealStage({
    dealId,
    pipeline,
    fromStageId: body.fromStageId,
    toStageId: body.toStageId,
    confirmWon: body.confirmWon === true,
    byEmail: auth.email,
  });
  return "error" in result ? NextResponse.json(result, { status: 400 }) : NextResponse.json(result);
}
