import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageInsurance } from "@/lib/erpAuth";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageInsurance(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const r = await prisma.coiRequest.findUnique({ where: { id }, select: { sampleData: true, sampleMimeType: true, sampleFilename: true } });
  if (!r?.sampleData) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(r.sampleData as unknown as BodyInit, {
    headers: {
      "Content-Type": r.sampleMimeType ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${(r.sampleFilename ?? "sample").replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
