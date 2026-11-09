import { NextResponse } from "next/server";
import { getErpAuth, isPmLevel } from "@/lib/erpAuth";
import { loadPmActivity, loadSubActivity } from "@/lib/erp/portalUsers";

type Ctx = { params: Promise<{ kind: string; id: string }> };

/** A sub's or property manager's recent activity, loaded when their row is opened. PM-level. */
export async function GET(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !isPmLevel(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { kind, id } = await ctx.params;
  if (kind !== "sub" && kind !== "pm") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ items: kind === "sub" ? await loadSubActivity(id) : await loadPmActivity(id) });
}
