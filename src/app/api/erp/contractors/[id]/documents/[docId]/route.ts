import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string; docId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id, docId } = await ctx.params;

  const doc = await prisma.contractorDocument.findFirst({
    where: { id: docId, contractorId: id },
    select: { data: true, mimeType: true, filename: true },
  });

  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(doc.data as unknown as BodyInit, {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `inline; filename="${doc.filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
