import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; attachmentId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id, attachmentId } = await ctx.params;

  const attachment = await prisma.projectWorkOrderAttachment.findFirst({
    where: { id: attachmentId, projectId: id },
  });
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(attachment.data as unknown as BodyInit, {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `inline; filename="${attachment.filename}"`,
      "Content-Length": String(attachment.size),
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id, attachmentId } = await ctx.params;

  const attachment = await prisma.projectWorkOrderAttachment.findFirst({
    where: { id: attachmentId, projectId: id },
    select: { id: true },
  });
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.projectWorkOrderAttachment.delete({ where: { id: attachmentId } });
  return NextResponse.json({ ok: true });
}
