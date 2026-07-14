import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const reimbursement = await prisma.reimbursement.findUnique({
    where: { id },
    select: { receiptData: true, receiptMimeType: true, receiptFilename: true },
  });
  if (!reimbursement?.receiptData) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  return new NextResponse(reimbursement.receiptData as unknown as BodyInit, {
    headers: {
      "Content-Type": reimbursement.receiptMimeType ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${reimbursement.receiptFilename ?? "receipt"}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
