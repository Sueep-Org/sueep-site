import { NextResponse } from "next/server";
import { getErpAuth, canViewPipelineBoard } from "@/lib/erpAuth";
import { setLostReason, type LostWinnerInput } from "@/lib/erp/dealLostReasons";

type Ctx = { params: Promise<{ dealId: string }> };

/** Set a lost deal's reason, or mark an open deal lost with a reason. Writes to HubSpot. */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canViewPipelineBoard(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { dealId } = await ctx.params;
  if (!/^\d+$/.test(dealId)) return NextResponse.json({ error: "Unknown deal." }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { pipeline?: unknown; reasons?: unknown; markLost?: unknown; winner?: unknown } | null;
  const pipeline = body?.pipeline === "janitorial" ? "janitorial" : body?.pipeline === "post-con" ? "post-con" : null;
  if (!pipeline) return NextResponse.json({ error: "Unknown pipeline." }, { status: 400 });
  const reasons = Array.isArray(body?.reasons) ? body!.reasons.filter((r): r is string => typeof r === "string").slice(0, 20) : [];
  const w = body?.winner as { companyId?: unknown; name?: unknown; priceCents?: unknown } | null | undefined;
  const winner: LostWinnerInput =
    w && typeof w.name === "string" && w.name.trim()
      ? {
          companyId: typeof w.companyId === "string" && w.companyId ? w.companyId : null,
          name: w.name.slice(0, 200),
          priceCents: w.priceCents == null || w.priceCents === "" ? null : Number(w.priceCents),
        }
      : null;
  const result = await setLostReason({ dealId, pipeline, reasons, markLost: body?.markLost === true, winner, byEmail: auth.email });
  return "error" in result ? NextResponse.json(result, { status: 400 }) : NextResponse.json(result);
}
