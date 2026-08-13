import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canEditPricing } from "@/lib/erpAuth";
import { parseChangeOrderPricingPackageInput } from "@/lib/changeOrderPricingPackages";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const auth = await getErpAuth();
  if (!auth || !canEditPricing(auth.role)) {
    return NextResponse.json(
      { error: "Only Admin, Project Manager, Sales, or Estimation roles can edit pricing packages" },
      { status: 403 },
    );
  }

  const existing = await prisma.changeOrderPricingPackage.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Partial update: only re-validate/replace fields actually sent, falling
  // back to what's already stored for anything omitted (e.g. toggling just
  // `active` shouldn't require resending name/hours).
  let input;
  try {
    input = parseChangeOrderPricingPackageInput({
      name: body.name ?? existing.name,
      unitLabel: body.unitLabel ?? existing.unitLabel,
      cleanerHours: body.cleanerHours ?? existing.cleanerHours,
      foremanHours: body.foremanHours ?? existing.foremanHours,
      active: body.active ?? existing.active,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid package" }, { status: 400 });
  }

  try {
    const pkg = await prisma.changeOrderPricingPackage.update({ where: { id }, data: input });
    return NextResponse.json(pkg);
  } catch (e) {
    console.error("PATCH /api/erp/change-order-pricing-packages/[id]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const auth = await getErpAuth();
  if (!auth || !canEditPricing(auth.role)) {
    return NextResponse.json(
      { error: "Only Admin, Project Manager, Sales, or Estimation roles can delete pricing packages" },
      { status: 403 },
    );
  }

  try {
    await prisma.changeOrderPricingPackage.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/erp/change-order-pricing-packages/[id]", e);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
