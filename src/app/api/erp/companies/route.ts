import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canEditCompanies, canViewCompanies } from "@/lib/erpAuth";
import { parseCompanyBody } from "@/lib/erp/clientCompanies";
import { loadCompanyOptions } from "@/lib/erp/clientCompaniesServer";

/** Picker options (not archived). */
export async function GET() {
  const auth = await getErpAuth();
  if (!auth || !canViewCompanies(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ companies: await loadCompanyOptions() });
}

export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canEditCompanies(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseCompanyBody(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const company = await prisma.clientCompany.create({ data: { ...parsed.data, updatedByEmail: auth.email }, select: { id: true } });
  return NextResponse.json({ id: company.id });
}
