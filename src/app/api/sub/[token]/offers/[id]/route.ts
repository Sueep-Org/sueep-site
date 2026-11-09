import { NextResponse } from "next/server";
import { requireSignedInSub } from "@/lib/erp/subPortalAccess";
import { acceptOffer, declineOffer } from "@/lib/erp/subOffers";

type Ctx = { params: Promise<{ token: string; id: string }> };

/** The sub answers an offer. Body: { action: "accept", crewCount, crewNames } or { action: "decline", reason, note } */
export async function POST(req: Request, ctx: Ctx) {
  const { token, id } = await ctx.params;
  const access = await requireSignedInSub(token);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { sub } = access;
  const body = (await req.json().catch(() => null)) as { action?: unknown; reason?: unknown; note?: unknown; crewCount?: unknown; crewNames?: unknown } | null;
  const result =
    body?.action === "accept"
      ? await acceptOffer(sub.id, id, { count: body.crewCount, names: body.crewNames }, sub.lang)
      : body?.action === "decline"
        ? await declineOffer(sub.id, id, body.reason, body.note, sub.lang)
        : { error: "Unknown action" };
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
