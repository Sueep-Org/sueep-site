import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageCompanyInfo } from "@/lib/erpAuth";
import { parseYearBody } from "../shared";

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
  const parsed = parseYearBody(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { count } = await prisma.companyFinancialYear.updateMany({ where: { id }, data: { ...parsed.data, updatedByEmail: auth.email } });
  if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** Removes the year and that year's P&L and balance sheet. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageCompanyInfo(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const row = await prisma.companyFinancialYear.findUnique({ where: { id }, select: { year: true } });
  if (!row) return NextResponse.json({ ok: true });
  await prisma.$transaction([
    prisma.companyDocument.deleteMany({ where: { year: row.year, kind: { in: ["PROFIT_LOSS", "BALANCE_SHEET"] } } }),
    prisma.companyFinancialYear.delete({ where: { id } }),
  ]);
  return NextResponse.json({ ok: true });
}
