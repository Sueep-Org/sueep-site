import { NextResponse } from "next/server";
import { getErpAuth, canApproveInvoices } from "@/lib/erpAuth";
import { deleteFollowUp } from "@/lib/erp/invoiceFollowUps";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canApproveInvoices(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const res = await deleteFollowUp(id, auth.email, auth.role === "ADMIN");
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
