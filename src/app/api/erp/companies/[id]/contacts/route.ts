import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canEditCompanies } from "@/lib/erpAuth";
import { parseContactBody } from "@/lib/erp/clientCompanies";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canEditCompanies(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseContactBody(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!(await prisma.clientCompany.count({ where: { id } }))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const contact = await prisma.clientCompanyContact.create({ data: { ...parsed.data, companyId: id }, select: { id: true } });
  return NextResponse.json({ id: contact.id });
}
