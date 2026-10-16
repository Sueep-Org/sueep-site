import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canApproveInvoices } from "@/lib/erpAuth";
import { emailAgain, invoiceLinesFor } from "@/lib/erp/invoiceDelivery";

type Ctx = { params: Promise<{ id: string }> };

/** Emails an invoice on Needs sending, after its address was fixed or the daily limit reset. */
export async function POST(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canApproveInvoices(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const d = await prisma.invoiceDelivery.findUnique({ where: { id }, select: { hubspotInvoiceId: true } });
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { lines, dueDate } = await invoiceLinesFor(d.hubspotInvoiceId);
  const result = await emailAgain(id, auth.email, lines, dueDate);
  return "error" in result ? NextResponse.json(result, { status: 400 }) : NextResponse.json(result);
}
