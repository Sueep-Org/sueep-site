import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageCompanyInfo } from "@/lib/erpAuth";
import { parseCompanyInfoBody } from "@/lib/erp/companyInfo";
import { companyInfoWriteData, toCompanyInfoRow } from "@/lib/erp/companyInfoServer";
import { MissingEncryptionKeyError } from "@/lib/erp/secretBox";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageCompanyInfo(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseCompanyInfoBody(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const existing = await prisma.companyInfoField.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    // Moving a row to another card puts it at the bottom of that card.
    let sortOrder = existing.sortOrder;
    if (parsed.data.section !== existing.section) {
      const last = await prisma.companyInfoField.findFirst({
        where: { section: parsed.data.section },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      sortOrder = (last?.sortOrder ?? 0) + 10;
    }
    const field = await prisma.companyInfoField.update({
      where: { id },
      data: { ...companyInfoWriteData(parsed.data, existing, auth.email), sortOrder },
    });
    return NextResponse.json({ row: toCompanyInfoRow(field) });
  } catch (e) {
    if (e instanceof MissingEncryptionKeyError) return NextResponse.json({ error: e.message }, { status: 500 });
    throw e;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageCompanyInfo(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  await prisma.companyInfoField.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
