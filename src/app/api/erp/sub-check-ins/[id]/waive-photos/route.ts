import { NextResponse } from "next/server";
import { getErpAuth } from "@/lib/erpAuth";
import { isPmLevel } from "@/lib/erpRoles";
import { waivePhotos } from "@/lib/erp/subPhotos";

type Ctx = { params: Promise<{ id: string }> };

/** Lets a sub check out without the minimum before/after photos. PM, Business Manager or Admin. Body: { reason } */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !isPmLevel(auth.role)) {
    return NextResponse.json({ error: "Only a PM, Business Manager or Admin can do this" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { reason?: unknown } | null;
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (!reason) return NextResponse.json({ error: "Say why" }, { status: 400 });
  const result = await waivePhotos(id, auth.email, reason);
  if ("error" in result) return NextResponse.json(result, { status: 409 });
  return NextResponse.json(result);
}
