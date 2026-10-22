import { NextResponse } from "next/server";
import { getErpAuth, canViewPipelineBoard } from "@/lib/erpAuth";
import { bookJobWalk } from "@/lib/erp/dealWalks";
import { loadDealsFor } from "@/lib/erp/dealEdits";

type Ctx = { params: Promise<{ dealId: string }> };

/** Book a job walk on an open deal: a HubSpot meeting on the deal plus Job Walk Date. */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canViewPipelineBoard(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { dealId } = await ctx.params;
  if (!/^\d+$/.test(dealId)) return NextResponse.json({ error: "Unknown deal." }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { pipeline?: unknown; day?: unknown; time?: unknown; minutes?: unknown; title?: unknown } | null;
  const pipeline = body?.pipeline === "janitorial" ? "janitorial" : body?.pipeline === "post-con" ? "post-con" : null;
  if (!pipeline) return NextResponse.json({ error: "Unknown pipeline." }, { status: 400 });
  // The meeting belongs to the person booking when they're a HubSpot owner, else to the deal's owner.
  const bundle = await loadDealsFor(pipeline).catch(() => null);
  const email = auth.email.toLowerCase();
  const ownerId = bundle ? (Object.entries(bundle.ownerEmails).find(([, e]) => e === email)?.[0] ?? null) : null;
  const result = await bookJobWalk({
    dealId,
    pipeline,
    day: typeof body?.day === "string" ? body.day : "",
    time: typeof body?.time === "string" ? body.time : "",
    minutes: Number(body?.minutes),
    title: typeof body?.title === "string" ? body.title : "",
    ownerId,
    byEmail: auth.email,
  });
  return "error" in result ? NextResponse.json(result, { status: 400 }) : NextResponse.json(result);
}
