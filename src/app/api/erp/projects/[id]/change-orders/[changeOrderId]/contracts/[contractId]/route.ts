import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { contractDownloadResponse } from "@/lib/erp/contractDownload";
import { getErpAuth, canSeeJobCosts } from "@/lib/erpAuth";

type Ctx = { params: Promise<{ id: string; changeOrderId: string; contractId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id, changeOrderId, contractId } = await ctx.params;

  const contract = await prisma.changeOrderContract.findFirst({
    where: { id: contractId, changeOrderId, changeOrder: { projectId: id } },
    select: { contractPdfFilename: true, signedDocumentUrl: true, unsignedPdfUrl: true, docusealSubmissionId: true, docusealTemplateId: true },
  });
  if (!contract) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // A contract made in the ERP and emailed: the signed copy once it's back, else the PDF that was sent.
  const { unsignedPdfUrl, ...rest } = contract;
  return contractDownloadResponse({ ...rest, signedDocumentUrl: rest.signedDocumentUrl ?? unsignedPdfUrl });
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

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * The client's signed copy of a contract that was emailed from the ERP
 * (signingStatus EMAILED). FormData: file (PDF), signedAt? (YYYY-MM-DD).
 * The screen then sets the change order to Approved through the change
 * order route, so its usual approval email goes out.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canSeeJobCosts(auth.role)) return NextResponse.json({ error: "You can't change contracts." }, { status: 403 });
  const { id, changeOrderId, contractId } = await ctx.params;
  const contract = await prisma.changeOrderContract.findFirst({
    where: { id: contractId, changeOrderId, changeOrder: { projectId: id } },
    select: { id: true, signingStatus: true },
  });
  if (!contract) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (contract.signingStatus !== "EMAILED") return NextResponse.json({ error: "Only an emailed contract takes a signed copy here." }, { status: 400 });

  const fd = await req.formData().catch(() => null);
  const file = fd?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Pick the signed PDF." }, { status: 400 });
  if (file.type !== "application/pdf") return NextResponse.json({ error: "Only PDF files are accepted" }, { status: 415 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "File must be 10 MB or smaller" }, { status: 413 });
  const signedAtRaw = fd?.get("signedAt");
  const signedAt = typeof signedAtRaw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(signedAtRaw) ? new Date(`${signedAtRaw}T00:00:00Z`) : new Date();
  const bytes = Buffer.from(await file.arrayBuffer());
  await prisma.changeOrderContract.update({
    where: { id: contractId },
    data: { signingStatus: "SIGNED", signedAt, signedDocumentUrl: `data:application/pdf;base64,${bytes.toString("base64")}` },
  });
  return NextResponse.json({ ok: true, signedAt: signedAt.toISOString() });
}
