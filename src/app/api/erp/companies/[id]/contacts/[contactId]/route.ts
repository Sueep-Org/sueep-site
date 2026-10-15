import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canEditCompanies } from "@/lib/erpAuth";
import { parseContactBody } from "@/lib/erp/clientCompanies";

type Ctx = { params: Promise<{ id: string; contactId: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canEditCompanies(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, contactId } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseContactBody(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { count } = await prisma.clientCompanyContact.updateMany({ where: { id: contactId, companyId: id }, data: parsed.data });
  if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canEditCompanies(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, contactId } = await ctx.params;
  await prisma.clientCompanyContact.deleteMany({ where: { id: contactId, companyId: id } });
  return NextResponse.json({ ok: true });
}
