import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canEditCompanies, canViewCompanies } from "@/lib/erpAuth";
import { overrideColumns, parseOverrideBody } from "@/lib/erp/clientCompanies";
import { setBuildingManager } from "@/lib/erp/clientCompaniesServer";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Body (each part optional):
 * - managedByCompanyId (+ asOf "YYYY-MM-DD"): changes the managing company,
 *   keeping the old one in the history with an end date.
 * - ownedByCompanyId
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
  if (!(await prisma.building.count({ where: { id } }))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const companyIds = [body.managedByCompanyId, body.ownedByCompanyId].filter((x): x is string => typeof x === "string" && x !== "");
  if (companyIds.length && (await prisma.clientCompany.count({ where: { id: { in: companyIds } } })) !== new Set(companyIds).size) {
    return NextResponse.json({ error: "That company no longer exists." }, { status: 400 });
  }

  let override: ReturnType<typeof overrideColumns> | null = null;
  if (body.override !== undefined) {
    if (!canEditCompanies(auth.role)) return NextResponse.json({ error: "Only Admin and Business Manager can change billing overrides." }, { status: 403 });
    const parsed = parseOverrideBody((body.override ?? {}) as Record<string, unknown>);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    override = overrideColumns(parsed.data);
  }

  await prisma.$transaction(async (tx) => {
    if (body.managedByCompanyId !== undefined) {
      const next = typeof body.managedByCompanyId === "string" && body.managedByCompanyId ? body.managedByCompanyId : null;
      await setBuildingManager(tx, id, next, typeof body.asOf === "string" ? body.asOf : null, auth.email);
    }
    const data: Record<string, unknown> = { ...(override ?? {}) };
    if (body.ownedByCompanyId !== undefined) data.ownedByCompanyId = typeof body.ownedByCompanyId === "string" && body.ownedByCompanyId ? body.ownedByCompanyId : null;
    if (Object.keys(data).length) await tx.building.update({ where: { id }, data });
  });
  return NextResponse.json({ ok: true });
}
