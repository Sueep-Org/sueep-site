import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { noticesForJanitor } from "@/lib/erp/janitorialQualityChecks";

type Ctx = { params: Promise<{ token: string; photoId: string }> };

/** A site visit photo, only for a janitor whose clock-in page shows that notice. */
export async function GET(_req: Request, ctx: Ctx) {
  const { token, photoId } = await ctx.params;
  if (!token || token.length < 20) return new NextResponse(null, { status: 404 });
  const employee = await prisma.employee.findFirst({ where: { clockToken: token, status: "ACTIVE" }, select: { id: true } });
  if (!employee) return new NextResponse(null, { status: 404 });

  const allowed = (await noticesForJanitor(employee.id)).some((n) => n.areas.some((a) => a.photoIds.includes(photoId)));
  if (!allowed) return new NextResponse(null, { status: 404 });

  const photo = await prisma.janitorialQualityPhoto.findUnique({ where: { id: photoId }, select: { data: true, mimeType: true } });
  if (!photo) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(photo.data), { headers: { "Content-Type": photo.mimeType, "Cache-Control": "private, max-age=3600" } });
}
