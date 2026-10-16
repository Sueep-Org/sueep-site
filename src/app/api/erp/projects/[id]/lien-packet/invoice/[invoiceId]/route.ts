import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";
import { contentDisposition } from "@/lib/contentDisposition";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; invoiceId: string }> };

/**
 * One of this project's HubSpot invoices as a PDF, fetched here because the
 * browser can't read HubSpot's file link directly when it builds the lien
 * packet. Only invoices already linked to this project are served.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, invoiceId } = await ctx.params;

  const link = await prisma.hubSpotSovInvoice.findFirst({
    where: { projectId: id, hubspotInvoiceId: invoiceId, pdfUrl: { not: null } },
    select: { pdfUrl: true, invoiceNumber: true },
  });
  if (!link?.pdfUrl) return NextResponse.json({ error: "No PDF for that invoice on this project" }, { status: 404 });

  try {
    const res = await fetch(link.pdfUrl, { cache: "no-store" });
    if (!res.ok) return NextResponse.json({ error: `HubSpot returned ${res.status} for the invoice PDF` }, { status: 502 });
    const name = (link.invoiceNumber ?? "invoice").replace(/["\\\r\n]/g, "");
    return new NextResponse(new Uint8Array(await res.arrayBuffer()), {
      headers: { "content-type": "application/pdf", "content-disposition": contentDisposition("attachment", `${name}.pdf`), "cache-control": "private, no-store" },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not fetch the invoice PDF" }, { status: 502 });
  }
}
