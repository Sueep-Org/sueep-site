import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { contentDisposition } from "@/lib/contentDisposition";
import { officeCandidateGuard } from "@/lib/erp/officeHiringAccess";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; docId: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id, docId } = await params;
  const blocked = await officeCandidateGuard(id);
  if (blocked) return blocked;

  const doc = await prisma.candidateDocument.findUnique({
    where: { id: docId },
    select: {
      candidateApplicationId: true,
      filename: true,
      mimeType: true,
      data: true,
    },
  });

  if (!doc || doc.candidateApplicationId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(doc.data), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": contentDisposition("inline", doc.filename),
      "Cache-Control": "private, no-store",
    },
  });
}
