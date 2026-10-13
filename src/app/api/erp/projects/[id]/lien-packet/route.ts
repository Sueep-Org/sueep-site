import { NextResponse } from "next/server";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";
import { lienPacketFiles, loadLienFactSheet } from "@/lib/erp/lienFactSheet";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** What the fact sheet would say and which documents go with it, for the Liens tab. Nothing is saved. */
export async function GET(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const result = await loadLienFactSheet(id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ...result, files: await lienPacketFiles(id, result.data.invoices) });
}
