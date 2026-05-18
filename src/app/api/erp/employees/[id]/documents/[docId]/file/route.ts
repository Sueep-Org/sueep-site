import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string; docId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id, docId } = await ctx.params;

  const doc = await prisma.employeeDocument.findFirst({
    where: { id: docId, employeeId: id },
    select: { fileData: true, fileMimeType: true, fileFilename: true },
  });

  if (!doc?.fileData) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const filename = doc.fileFilename ?? "document";
  return new NextResponse(doc.fileData as unknown as BodyInit, {
    headers: {
      "Content-Type": doc.fileMimeType ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
