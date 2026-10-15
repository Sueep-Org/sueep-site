import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canEditCompanies } from "@/lib/erpAuth";

type Ctx = { params: Promise<{ id: string }> };

/** Link or unlink a property manager, COI holder or Company Info login
 * (their billing portal) to this company. Their own records are left alone.
 * Body: { kind, targetId, linked }. */
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
  const targetId = typeof body.targetId === "string" ? body.targetId : "";
  if (!targetId) return NextResponse.json({ error: "Pick one first." }, { status: 400 });
  if (!(await prisma.clientCompany.count({ where: { id } }))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const linked = body.linked !== false;

  // Logins can serve several companies, so they link through a join table.
  if (body.kind === "login") {
    if (!linked) {
      await prisma.clientCompanyLogin.deleteMany({ where: { companyId: id, loginId: targetId } });
      return NextResponse.json({ ok: true });
    }
    if (!(await prisma.companyLogin.count({ where: { id: targetId } }))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.clientCompanyLogin.upsert({
      where: { companyId_loginId: { companyId: id, loginId: targetId } },
      create: { companyId: id, loginId: targetId, linkedByEmail: auth.email },
      update: {},
    });
    return NextResponse.json({ ok: true });
  }

  // Unlinking only clears a link that points at this company.
  const where = linked ? { id: targetId } : { id: targetId, companyId: id };
  const data = { companyId: linked ? id : null };
  let count: number;
  if (body.kind === "propertyManager") ({ count } = await prisma.propertyManager.updateMany({ where, data }));
  else if (body.kind === "coiHolder") ({ count } = await prisma.coiHolder.updateMany({ where, data }));
  else return NextResponse.json({ error: "Unknown link type" }, { status: 400 });

  if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
