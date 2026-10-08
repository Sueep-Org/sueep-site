import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageCompanyInfo } from "@/lib/erpAuth";
import { parseCompanyLoginBody } from "@/lib/erp/companyInfo";
import { companyLoginWriteData } from "@/lib/erp/companyInfoServer";
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

  const parsed = parseCompanyLoginBody(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const { count } = await prisma.companyLogin.updateMany({ where: { id }, data: companyLoginWriteData(parsed.data, auth.email) });
    if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
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
  await prisma.companyLogin.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
