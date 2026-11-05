import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeInvoices } from "@/lib/erpAuth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ proofId: string }> };

/** The screenshot or PDF saved when an invoice was marked uploaded or sent. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canSeeInvoices(auth.role)) return new NextResponse(null, { status: 403 });
  const { proofId } = await ctx.params;
  const proof = await prisma.invoiceDeliveryProof.findUnique({ where: { id: proofId }, select: { data: true, mimeType: true, filename: true } });
  if (!proof) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(proof.data), {
    headers: {
      "Content-Type": proof.mimeType,
      "Content-Disposition": `inline; filename="${proof.filename.replace(/[^\w.\- ]/g, "_")}"`,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
