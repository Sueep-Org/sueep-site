import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageCompanyInfo } from "@/lib/erpAuth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Opens an uploaded file (links open directly from the page). */
export async function GET(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageCompanyInfo(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const doc = await prisma.companyDocument.findUnique({ where: { id }, select: { data: true, mimeType: true, filename: true } });
  if (!doc?.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // PDFs and images open in the browser; spreadsheets and Word files download.
  const inline = doc.mimeType === "application/pdf" || doc.mimeType?.startsWith("image/");
  const filename = (doc.filename ?? "document").replace(/["\\\r\n]/g, "");
  return new NextResponse(doc.data as unknown as BodyInit, {
    headers: {
      "Content-Type": doc.mimeType ?? "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageCompanyInfo(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  await prisma.companyDocument.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
