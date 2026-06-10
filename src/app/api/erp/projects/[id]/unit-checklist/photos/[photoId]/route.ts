import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; photoId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { photoId } = await ctx.params;

  const photo = await prisma.unitChecklistPhoto.findUnique({
    where: { id: photoId },
    select: { data: true, mimeType: true, filename: true },
  });
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(photo.data as unknown as BodyInit, {
    headers: {
      "Content-Type": photo.mimeType,
      "Content-Disposition": `inline; filename="${photo.filename}"`,
      "Cache-Control": "private, max-age=31536000",
    },
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { photoId } = await ctx.params;

  const photo = await prisma.unitChecklistPhoto.findUnique({
    where: { id: photoId },
    select: { id: true },
  });
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.unitChecklistPhoto.delete({ where: { id: photoId } });
  return NextResponse.json({ ok: true });
}
