import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canEditCompanies, canViewCompanies } from "@/lib/erpAuth";
import { overrideColumns, parseOverrideBody } from "@/lib/erp/clientCompanies";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Body (each part optional):
 * - clientCompanyId: who we bill. Empty means the building's managing company.
 * - override { method, portalUrl, sendTo, cc, note }: Admin and Business Manager only.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canViewCompanies(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.clientCompanyId !== undefined) {
    const next = typeof body.clientCompanyId === "string" && body.clientCompanyId ? body.clientCompanyId : null;
    if (next && !(await prisma.clientCompany.count({ where: { id: next } }))) return NextResponse.json({ error: "That company no longer exists." }, { status: 400 });
    data.clientCompanyId = next;
  }
  if (body.override !== undefined) {
    if (!canEditCompanies(auth.role)) return NextResponse.json({ error: "Only Admin and Business Manager can change billing overrides." }, { status: 403 });
    const parsed = parseOverrideBody((body.override ?? {}) as Record<string, unknown>);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    Object.assign(data, overrideColumns(parsed.data));
  }
  if (!Object.keys(data).length) return NextResponse.json({ ok: true });

  const { count } = await prisma.project.updateMany({ where: { id }, data });
  if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
