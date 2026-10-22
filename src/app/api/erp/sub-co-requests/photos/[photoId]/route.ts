import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, isPmLevel } from "@/lib/erpAuth";

type Ctx = { params: Promise<{ photoId: string }> };

/** A photo on a sub's change order request, for the unit's CO Requests tab. */
export async function GET(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !isPmLevel(auth.role)) return new NextResponse("Not found", { status: 404 });
  const { photoId } = await ctx.params;
  const photo = await prisma.subCoRequestPhoto.findFirst({ where: { id: photoId, requestId: { not: null } }, select: { data: true, mimeType: true } });
  if (!photo) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(photo.data), {
    headers: { "Content-Type": photo.mimeType, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
