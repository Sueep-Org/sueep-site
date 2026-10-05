import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManagePropertyManagers } from "@/lib/erpAuth";
import { parsePropertyManagerBody } from "@/lib/erp/propertyManagers";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManagePropertyManagers(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = await parsePropertyManagerBody(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { buildingIds, ...data } = parsed.data;

  const existing = await prisma.propertyManager.findUnique({ where: { email: data.email }, select: { id: true, name: true } });
  if (existing && existing.id !== id) {
    return NextResponse.json({ error: `${existing.name} already uses this email.` }, { status: 409 });
  }

  try {
    await prisma.$transaction([
      prisma.propertyManager.update({ where: { id }, data }),
      prisma.propertyManagerBuilding.deleteMany({ where: { propertyManagerId: id } }),
      prisma.propertyManagerBuilding.createMany({ data: buildingIds.map((buildingId) => ({ propertyManagerId: id, buildingId })) }),
    ]);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManagePropertyManagers(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  try {
    await prisma.propertyManager.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
