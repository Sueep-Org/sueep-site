import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ photoId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) return new NextResponse(null, { status: 403 });
  const { photoId } = await ctx.params;
  const photo = await prisma.janitorialQualityPhoto.findUnique({ where: { id: photoId }, select: { data: true, mimeType: true } });
  if (!photo) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(photo.data), {
    headers: { "Content-Type": photo.mimeType, "Cache-Control": "private, max-age=86400" },
  });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { photoId } = await ctx.params;
  const deleted = await prisma.janitorialQualityPhoto.deleteMany({ where: { id: photoId } });
  if (!deleted.count) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
