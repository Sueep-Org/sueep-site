import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeInvoices } from "@/lib/erpAuth";
import { qboGetPdf } from "@/lib/erp/qboClient";

type Ctx = { params: Promise<{ qboId: string }> };

/** QuickBooks' PDF of any invoice on the Invoices page, so it opens without a QuickBooks login. */
export async function GET(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canSeeInvoices(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { qboId } = await ctx.params;
  // Only invoices the ERP knows about: read nightly, or made by the ERP.
  const known =
    (await prisma.qboInvoice.findUnique({ where: { qboId }, select: { docNumber: true } })) ??
    (await prisma.qboInvoiceDraft.findFirst({ where: { qboInvoiceId: qboId, status: "APPROVED" }, select: { invoiceNumber: true } }).then((d) => (d ? { docNumber: d.invoiceNumber } : null)));
  if (!known) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const pdf = await qboGetPdf(`/invoice/${encodeURIComponent(qboId)}/pdf`);
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="Sueep invoice ${known.docNumber ?? qboId}.pdf"` },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
