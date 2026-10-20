import { NextResponse } from "next/server";
import { getErpAuth, canViewPipelineBoard } from "@/lib/erpAuth";
import { completeNextStep, saveNextStep } from "@/lib/erp/dealFollowUps";

type Ctx = { params: Promise<{ dealId: string }> };

async function dealIdOrNull(ctx: Ctx): Promise<string | null> {
  const { dealId } = await ctx.params;
  return /^\d+$/.test(dealId) ? dealId : null;
}

/** Add or change the deal's next step. ERP only, nothing goes to HubSpot. */
export async function PUT(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canViewPipelineBoard(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const dealId = await dealIdOrNull(ctx);
  if (!dealId) return NextResponse.json({ error: "Unknown deal." }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { pipeline?: unknown; dealName?: unknown; text?: unknown; dueDate?: unknown } | null;
  const pipeline = body?.pipeline === "janitorial" ? "janitorial" : body?.pipeline === "post-con" ? "post-con" : null;
  if (!pipeline) return NextResponse.json({ error: "Unknown pipeline." }, { status: 400 });
  const result = await saveNextStep({
    dealId,
    pipeline,
    dealName: typeof body?.dealName === "string" ? body.dealName.slice(0, 300) : "(no name)",
    text: typeof body?.text === "string" ? body.text : "",
    dueDate: typeof body?.dueDate === "string" ? body.dueDate : "",
    byEmail: auth.email,
  });
  return "error" in result ? NextResponse.json(result, { status: 400 }) : NextResponse.json(result);
}

/** Mark the deal's next step done (kept for history, not deleted). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canViewPipelineBoard(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const dealId = await dealIdOrNull(ctx);
  if (!dealId) return NextResponse.json({ error: "Unknown deal." }, { status: 400 });
  return NextResponse.json(await completeNextStep(dealId, auth.email));
}
