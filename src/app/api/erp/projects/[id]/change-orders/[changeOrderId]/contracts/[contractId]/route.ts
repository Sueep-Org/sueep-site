import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { contractDownloadResponse } from "@/lib/erp/contractDownload";

type Ctx = { params: Promise<{ id: string; changeOrderId: string; contractId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id, changeOrderId, contractId } = await ctx.params;

  const contract = await prisma.changeOrderContract.findFirst({
    where: { id: contractId, changeOrderId, changeOrder: { projectId: id } },
    select: { contractPdfFilename: true, signedDocumentUrl: true, docusealSubmissionId: true, docusealTemplateId: true },
  });
  if (!contract) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return contractDownloadResponse(contract);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { changeOrderId, contractId } = await ctx.params;

  const contract = await prisma.changeOrderContract.findFirst({
    where: { id: contractId, changeOrderId },
    select: { id: true, signingStatus: true },
  });
  if (!contract) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.changeOrderContract.delete({ where: { id: contractId } });

  return NextResponse.json({ ok: true });
}
