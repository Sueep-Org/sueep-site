import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageInsurance } from "@/lib/erpAuth";

type Ctx = { params: Promise<{ id: string; coiId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageInsurance(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id, coiId } = await ctx.params;
  const coi = await prisma.projectCoi.findFirst({
    where: { id: coiId, projectId: id },
    select: { data: true, mimeType: true, filename: true },
  });
  if (!coi) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(coi.data as unknown as BodyInit, {
    headers: {
      "Content-Type": coi.mimeType,
      "Content-Disposition": `inline; filename="${coi.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
