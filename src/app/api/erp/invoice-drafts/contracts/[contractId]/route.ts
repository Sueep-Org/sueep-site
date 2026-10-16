import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canApproveInvoices } from "@/lib/erpAuth";

type Ctx = { params: Promise<{ contractId: string }> };

/** Turn auto-draft on or off for a contract, or change its invoice line label. */
export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canApproveInvoices(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { contractId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { autoDraftInvoices?: unknown; invoiceLabel?: unknown };
  const data: { autoDraftInvoices?: boolean; invoiceLabel?: string | null } = {};
  if (typeof body.autoDraftInvoices === "boolean") data.autoDraftInvoices = body.autoDraftInvoices;
  if (body.invoiceLabel !== undefined) data.invoiceLabel = typeof body.invoiceLabel === "string" ? body.invoiceLabel.trim().slice(0, 100) || null : null;
  const { count } = await prisma.recurringContract.updateMany({ where: { id: contractId }, data });
  if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
