import { NextResponse } from "next/server";
import { getErpAuth, canApproveInvoices } from "@/lib/erpAuth";
import { setPortalStatus } from "@/lib/erp/invoiceDelivery";

type Ctx = { params: Promise<{ id: string }> };

/** Under review, Approved or Sent back (with the reason) for an invoice uploaded to a portal. */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canApproveInvoices(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { status?: unknown; note?: unknown };
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) || null : null;
  const res = await setPortalStatus(id, auth.email, body.status, note);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
