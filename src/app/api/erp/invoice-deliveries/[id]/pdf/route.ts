import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canApproveInvoices } from "@/lib/erpAuth";
import { qboGetPdf } from "@/lib/erp/qboClient";

type Ctx = { params: Promise<{ id: string }> };

/** QuickBooks' PDF of an invoice on Ready to send, for portal uploads. */
export async function GET(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canApproveInvoices(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const d = await prisma.invoiceDelivery.findUnique({ where: { id }, select: { qboInvoiceId: true, invoiceNumber: true } });
  if (!d?.qboInvoiceId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const pdf = await qboGetPdf(`/invoice/${encodeURIComponent(d.qboInvoiceId)}/pdf`);
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="Sueep invoice ${d.invoiceNumber ?? d.qboInvoiceId}.pdf"` },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
