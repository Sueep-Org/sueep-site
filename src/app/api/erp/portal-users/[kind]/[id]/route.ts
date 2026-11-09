import { NextResponse } from "next/server";
import { getErpAuth, isPmLevel } from "@/lib/erpAuth";
import { runPortalAction, type PortalAction, type PortalKind } from "@/lib/erp/portalUsers";

type Ctx = { params: Promise<{ kind: string; id: string }> };

/** Turn a sub's or property manager's page off or on, or sign out their phones. Body: { action, reason }. PM-level. */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !isPmLevel(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { kind, id } = await ctx.params;
  if (kind !== "sub" && kind !== "pm") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { action?: unknown; reason?: unknown } | null;
  const action = body?.action;
  if (action !== "off" && action !== "on" && action !== "sign-out") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  const result = await runPortalAction(kind as PortalKind, id, action as PortalAction, auth.email, typeof body?.reason === "string" ? body.reason : null);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
