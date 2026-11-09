import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { contentDisposition } from "@/lib/contentDisposition";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; photoId: string }> };

/** ?size=thumb serves the 320px preview (the full photo when there's none). */
export async function GET(req: Request, ctx: Ctx) {
  const { photoId } = await ctx.params;
  const wantThumb = new URL(req.url).searchParams.get("size") === "thumb";

  // One image column at a time, so a preview never loads the full photo
  const thumb = wantThumb
    ? await prisma.unitChecklistPhoto.findUnique({ where: { id: photoId }, select: { thumb: true, filename: true } })
    : null;
  const photo =
    thumb?.thumb != null
      ? { data: thumb.thumb, mimeType: "image/jpeg", filename: thumb.filename }
      : await prisma.unitChecklistPhoto.findUnique({ where: { id: photoId }, select: { data: true, mimeType: true, filename: true } });
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(photo.data as unknown as BodyInit, {
    headers: {
      "Content-Type": photo.mimeType,
      "Content-Disposition": contentDisposition("inline", photo.filename),
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
