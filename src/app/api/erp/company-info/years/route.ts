import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageCompanyInfo } from "@/lib/erpAuth";
import { parseYear } from "@/lib/erp/companyInfo";
import { parseYearBody } from "./shared";

export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canManageCompanyInfo(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const year = parseYear(body.year);
  if (year == null) return NextResponse.json({ error: "Enter a valid year." }, { status: 400 });
  const parsed = parseYearBody(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const existing = await prisma.companyFinancialYear.findUnique({ where: { year }, select: { id: true } });
  if (existing) return NextResponse.json({ error: `${year} is already on the list.` }, { status: 409 });

  const row = await prisma.companyFinancialYear.create({ data: { year, ...parsed.data, updatedByEmail: auth.email } });
  return NextResponse.json({ id: row.id });
}
