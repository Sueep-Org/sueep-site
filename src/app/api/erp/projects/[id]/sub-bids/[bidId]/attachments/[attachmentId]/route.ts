import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { contentDisposition } from "@/lib/contentDisposition";
import { canSeeProposals } from "@/lib/erp/subBids";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; bidId: string; attachmentId: string }> };

/** Open a bid's file. PDFs and images open in the browser; spreadsheets and Word files download. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeProposals(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, bidId, attachmentId } = await ctx.params;
  const file = await prisma.subBidAttachment.findFirst({ where: { id: attachmentId, bidId, bid: { projectId: id } } });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const inline = file.mimeType === "application/pdf" || file.mimeType.startsWith("image/");
  return new NextResponse(file.data as unknown as BodyInit, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": contentDisposition(inline ? "inline" : "attachment", file.filename),
      "Content-Length": String(file.size),
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeProposals(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, bidId, attachmentId } = await ctx.params;
  const { count } = await prisma.subBidAttachment.deleteMany({ where: { id: attachmentId, bidId, bid: { projectId: id } } });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
