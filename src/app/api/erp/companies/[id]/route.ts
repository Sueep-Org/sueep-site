import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canEditCompanies } from "@/lib/erpAuth";
import { parseCompanyBody } from "@/lib/erp/clientCompanies";

type Ctx = { params: Promise<{ id: string }> };

/** Saves the whole company: name, type, aliases, notes, archived and billing profile. */
export async function PUT(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canEditCompanies(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseCompanyBody(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { count } = await prisma.clientCompany.updateMany({ where: { id }, data: { ...parsed.data, updatedByEmail: auth.email } });
  if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
